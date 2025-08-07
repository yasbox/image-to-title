import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Image to Title worker', () => {
    beforeEach(() => {
        // テスト用の環境変数を設定
        Object.assign(env, {
            OPENAI_API_KEY: 'test-api-key',
            PAGE_PASSWORD: 'test-password',
            SESSIONS_KV: {
                get: async () => 'active',
                put: async () => { },
                delete: async () => { }
            } as any,
            ASSETS: {
                fetch: async (request: Request) => new Response('Asset content')
            } as any
        });
    });

    describe('Basic routing', () => {
        it('redirects to login for unauthenticated requests to /api/title', async () => {
            const request = new IncomingRequest('http://example.com/api/title');
            const response = await worker.fetch(request, env as Env);
            expect(response.status).toBe(302); // Redirect to login
        });

        it('serves assets for authenticated requests', async () => {
            const request = new IncomingRequest('http://example.com/index.html', {
                headers: {
                    'Cookie': 'session_id=test-session'
                }
            });
            const response = await worker.fetch(request, env as Env);
            expect(response.status).toBe(200);
        });

        it('redirects to login for unauthenticated requests to protected paths', async () => {
            const request = new IncomingRequest('http://example.com/');
            const response = await worker.fetch(request, env as Env);
            expect(response.status).toBe(302);
            expect(response.headers.get('Location')).toBe('/login.html');
        });
    });

    describe('Authentication', () => {
        it('handles successful login', async () => {
            const request = new IncomingRequest('http://example.com/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'test-password' })
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
            const data = await response.json() as { success: boolean };
            expect(data.success).toBe(true);
            expect(response.headers.get('Set-Cookie')).toContain('session_id=');
        });

        it('handles failed login', async () => {
            const request = new IncomingRequest('http://example.com/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'wrong-password' })
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(401);
            const data = await response.json() as { success: boolean };
            expect(data.success).toBe(false);
        });

        it('handles logout', async () => {
            const request = new IncomingRequest('http://example.com/api/logout', {
                method: 'POST',
                headers: { 'Cookie': 'session_id=test-session' }
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
            const data = await response.json() as { success: boolean };
            expect(data.success).toBe(true);
        });

        it('checks session status', async () => {
            const request = new IncomingRequest('http://example.com/api/session/status', {
                headers: { 'Cookie': 'session_id=test-session' }
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
            const data = await response.json() as { authenticated: boolean };
            expect(data.authenticated).toBe(true);
        });
    });

    describe('Title generation API', () => {
        it('responds with error for POST without image data', async () => {
            const request = new IncomingRequest('http://example.com/api/title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'session_id=test-session',
                    'X-API-Key': 'image-title-api-key-2024' // 有効なAPIキーを設定
                },
                body: JSON.stringify({})
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(400);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('画像データが提供されていません');
        });

        it('responds with error for invalid API key', async () => {
            const request = new IncomingRequest('http://example.com/api/title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'session_id=test-session',
                    'X-API-Key': 'invalid-key'
                },
                body: JSON.stringify({ image_base64: 'test-image-data' })
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(401);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('無効なAPIキーです');
        });

        it('handles valid title generation request', async () => {
            // Mock OpenAI API response by overriding fetch
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
                const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
                if (urlString.includes('api.openai.com')) {
                    return new Response(JSON.stringify({
                        choices: [{
                            message: {
                                content: '1. Beautiful Sunset\n   美しい夕日\n\n2. Golden Hour\n   ゴールデンアワー'
                            }
                        }]
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                return originalFetch(url, options);
            };

            const request = new IncomingRequest('http://example.com/api/title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'session_id=test-session',
                    'X-API-Key': 'image-title-api-key-2024'
                },
                body: JSON.stringify({ image_base64: 'test-image-data' })
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
            const data = await response.json() as { titles: string };
            expect(data.titles).toContain('Beautiful Sunset');

            // Restore original fetch
            globalThis.fetch = originalFetch;
        });
    });

    describe('Error handling', () => {
        it('handles malformed JSON in request body', async () => {
            const request = new IncomingRequest('http://example.com/api/title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': 'session_id=test-session'
                },
                body: 'invalid-json'
            });
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(500);
            const data = await response.json() as { error: string };
            expect(data.error).toBe('リクエスト処理中にエラーが発生しました');
        });

        it('handles missing Content-Type header for login', async () => {
            const request = new IncomingRequest('http://example.com/api/login', {
                method: 'POST',
                body: JSON.stringify({ password: 'test-password' })
            });
            const response = await worker.fetch(request, env as Env);

            // 実際の動作では、Content-TypeヘッダーがなくてもJSONとして解析を試みる
            // パスワードが正しければ成功する
            expect(response.status).toBe(200);
        });
    });

    describe('Public paths', () => {
        it('serves login page without authentication', async () => {
            const request = new IncomingRequest('http://example.com/login.html');
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
        });

        it('serves styles.css without authentication', async () => {
            const request = new IncomingRequest('http://example.com/styles.css');
            const response = await worker.fetch(request, env as Env);

            expect(response.status).toBe(200);
        });
    });
});
