export interface Env {
    OPENAI_API_KEY: string
    ASSETS: Fetcher
    // レート制限用のKVストレージ（オプション）
    RATE_LIMIT_KV?: KVNamespace
    // APIキー用の環境変数
    API_KEYS?: string
    // フロントエンド専用APIキー（フロントエンドからのリクエストを自動認証）
    FRONTEND_API_KEY?: string
    // ページアクセス用パスワード
    PAGE_PASSWORD: string
    // セッション管理用のKVストレージ
    SESSIONS_KV: KVNamespace
}

interface RequestBody {
    image_base64: string
    api_key?: string
}

interface OpenAIResponse {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
}

// レート制限設定
const RATE_LIMIT = {
    MAX_REQUESTS_PER_HOUR: 10,
    MAX_REQUESTS_PER_DAY: 50,
}

// セッション設定
const SESSION_TTL = 3600 // セッション有効期限（秒）
const SESSION_COOKIE_NAME = 'session_id'

// 認証が不要なパス
const PUBLIC_PATHS = ['/login.html', '/api/login', '/styles.css', '/api/session/status', '/api/logout']
// 保護対象のパス一覧
const PROTECTED_PATHS = ['/', '/index.html']

// プロンプト設定
const TITLE_GENERATION_PROMPT = `画像の内容を分析して、魅力的で簡潔な英語タイトルを5つ生成してください。
画像に写っているもの、雰囲気、色合い、構図などを考慮して、適切なタイトルを作成してください。
人物を特定する目的ではありません。一般的なタイトルを作成してください。
センシティブな内容を含む場合は、それを取り除いて表現してください。

各タイトルの下に日本語訳を付けてください。
必ず以下の形式で出力してください（改行を必ず含めてください）：

1. [英語タイトル]
   [日本語訳]

2. [英語タイトル]
   [日本語訳]

3. [英語タイトル]
   [日本語訳]

4. [英語タイトル]
   [日本語訳]

5. [英語タイトル]
   [日本語訳]

重要：各タイトルと日本語訳の間に必ず改行を入れてください。1行で出力しないでください。`

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url)
        const pathname = url.pathname

        // 保護対象のパスチェック
        if (PROTECTED_PATHS.includes(pathname)) {
            const cookies = parseCookies(request.headers.get('Cookie') || '')
            const sessionId = cookies[SESSION_COOKIE_NAME]

            if (sessionId && await isValidSession(sessionId, env)) {
                // /へのアクセスは明示的に/index.htmlに変換
                if (pathname === '/') {
                    const targetRequest = new Request(new URL('/index.html', request.url))
                    return env.ASSETS.fetch(targetRequest)
                }
                return env.ASSETS.fetch(request)
            }

            return redirectToLogin()
        }

        // 認証不要パス
        if (PUBLIC_PATHS.includes(pathname) || pathname === '/api/login') {
            return handlePublicRequest(request, env)
        }

        // その他のリソースは認証が必要
        const cookies = parseCookies(request.headers.get('Cookie') || '')
        const sessionId = cookies[SESSION_COOKIE_NAME]

        if (sessionId && await isValidSession(sessionId, env)) {
            // APIエンドポイントの処理
            if (pathname === '/api/title' && request.method.toUpperCase() === 'POST') {
                return handleTitleRequest(request, env)
            }
            return env.ASSETS.fetch(request)
        }

        return redirectToLogin()
    }
}

// ログインなどの認証不要リクエスト処理
async function handlePublicRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // ログイン処理
    if (url.pathname === '/api/login' && request.method === 'POST') {
        try {
            const body = await request.json() as { password?: string }
            const inputPassword = (body.password || '').trim()
            const correctPassword = env.PAGE_PASSWORD?.trim()

            if (!correctPassword || inputPassword !== correctPassword) {
                return json({ success: false, message: '認証失敗' }, 401)
            }

            // 認証成功 → セッション作成
            const sessionId = crypto.randomUUID()
            await env.SESSIONS_KV.put(`session:${sessionId}`, 'active', { expirationTtl: SESSION_TTL })

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; SameSite=Strict; Secure`
                }
            })
        } catch (error) {
            console.error('Login error:', error)
            return json({ success: false, message: 'ログイン処理中にエラーが発生しました' }, 500)
        }
    }

    // ログアウト処理
    if (url.pathname === '/api/logout' && request.method === 'POST') {
        const cookies = parseCookies(request.headers.get('Cookie') || '')
        const sessionId = cookies[SESSION_COOKIE_NAME]

        if (sessionId) {
            await env.SESSIONS_KV.delete(`session:${sessionId}`)
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict; HttpOnly; Secure`
            }
        })
    }

    // セッション状態確認API
    if (url.pathname === '/api/session/status' && request.method === 'GET') {
        const cookies = parseCookies(request.headers.get('Cookie') || '')
        const sessionId = cookies[SESSION_COOKIE_NAME]

        if (sessionId && await isValidSession(sessionId, env)) {
            return json({ authenticated: true, sessionId })
        } else {
            return json({ authenticated: false, sessionId: null })
        }
    }

    // APIエンドポイントの処理
    if (url.pathname === '/api/title' && request.method.toUpperCase() === 'POST') {
        return handleTitleRequest(request, env)
    }

    return env.ASSETS.fetch(request)
}

// タイトル生成APIの処理
async function handleTitleRequest(request: Request, env: Env): Promise<Response> {
    try {
        const requestText = await request.text()
        const body = JSON.parse(requestText)
        const { image_base64, api_key } = body as RequestBody

        let apiKey = request.headers.get('X-API-Key') || api_key

        // フロントエンドからのリクエストかチェック（本番環境対応）
        const referer = request.headers.get('Referer')
        const origin = request.headers.get('Origin')
        const userAgent = request.headers.get('User-Agent')

        // ブラウザからのリクエストかチェック（User-Agent、Referer、Originのいずれかが存在）
        const isFrontendRequest = referer || origin || (userAgent && !userAgent.includes('curl') && !userAgent.includes('Postman'))

        if (!apiKey && isFrontendRequest) {
            const frontendApiKey = env.FRONTEND_API_KEY
            if (frontendApiKey) {
                apiKey = frontendApiKey
            }
        }

        if (!validateApiKey(apiKey, env)) {
            return json({ error: '無効なAPIキーです' }, 401)
        }

        const clientIP = request.headers.get('CF-Connecting-IP') ||
            request.headers.get('X-Forwarded-For') ||
            'unknown'

        const rateLimit = await checkRateLimit(clientIP, env)
        if (!rateLimit.allowed) {
            return json({
                error: 'レート制限に達しました',
                remaining: rateLimit.remaining,
                resetTime: rateLimit.resetTime
            }, 429)
        }

        if (!image_base64) {
            return json({ error: '画像データが提供されていません' }, 400)
        }

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: TITLE_GENERATION_PROMPT },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${image_base64}`,
                                },
                            },
                        ],
                    },
                ],
            }),
        })

        const result = await openaiRes.json() as OpenAIResponse
        const titles = result?.choices?.[0]?.message?.content || 'タイトル生成失敗'

        return json({ titles })
    } catch (error) {
        console.error('Error processing request:', error)
        return json({ error: 'リクエスト処理中にエラーが発生しました' }, 500)
    }
}

// セッション有効性を検証
async function isValidSession(sessionId: string, env: Env): Promise<boolean> {
    const value = await env.SESSIONS_KV.get(`session:${sessionId}`)
    return value === 'active'
}

// Cookie パース
function parseCookies(cookieStr: string): Record<string, string> {
    return Object.fromEntries(
        cookieStr.split(';').map(v => v.trim().split('=')).filter(([k, v]) => k && v)
    )
}

// JSON レスポンス
function json(obj: any, status = 200): Response {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

// ログインページへのリダイレクト
function redirectToLogin(): Response {
    return new Response(null, {
        status: 302,
        headers: {
            'Location': '/login.html',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
}

// 有効なAPIキーを取得
function getValidApiKeys(env: Env): string[] {
    if (!env.API_KEYS) {
        return ['image-title-api-key-2024']
    }
    return env.API_KEYS.split(',').map(key => key.trim()).filter(key => key.length > 0)
}

// APIキーの検証
function validateApiKey(apiKey: string | undefined, env: Env): boolean {
    if (!apiKey) return false

    const frontendApiKey = env.FRONTEND_API_KEY
    if (frontendApiKey && apiKey === frontendApiKey) {
        return true
    }

    const validApiKeys = getValidApiKeys(env)
    return validApiKeys.includes(apiKey)
}

// レート制限チェック
async function checkRateLimit(ip: string, env: Env): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!env.RATE_LIMIT_KV) {
        return { allowed: true, remaining: 999, resetTime: Date.now() + 3600000 }
    }

    const now = Date.now()
    const hourKey = `rate_limit:${ip}:hour:${Math.floor(now / 3600000)}`
    const dayKey = `rate_limit:${ip}:day:${Math.floor(now / 86400000)}`

    const [hourCount, dayCount] = await Promise.all([
        env.RATE_LIMIT_KV.get(hourKey, 'text').then(v => parseInt(v || '0')),
        env.RATE_LIMIT_KV.get(dayKey, 'text').then(v => parseInt(v || '0'))
    ])

    const hourAllowed = hourCount < RATE_LIMIT.MAX_REQUESTS_PER_HOUR
    const dayAllowed = dayCount < RATE_LIMIT.MAX_REQUESTS_PER_DAY

    if (hourAllowed && dayAllowed) {
        await Promise.all([
            env.RATE_LIMIT_KV.put(hourKey, (hourCount + 1).toString(), { expirationTtl: 3600 }),
            env.RATE_LIMIT_KV.put(dayKey, (dayCount + 1).toString(), { expirationTtl: 86400 })
        ])
    }

    return {
        allowed: hourAllowed && dayAllowed,
        remaining: Math.min(
            RATE_LIMIT.MAX_REQUESTS_PER_HOUR - hourCount,
            RATE_LIMIT.MAX_REQUESTS_PER_DAY - dayCount
        ),
        resetTime: Math.floor(now / 3600000) * 3600000 + 3600000
    }
} 