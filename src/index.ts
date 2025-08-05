export interface Env {
	OPENAI_API_KEY: string
	ASSETS: Fetcher
}

interface RequestBody {
	image_base64: string
}

interface OpenAIResponse {
	choices?: Array<{
		message?: {
			content?: string
		}
	}>
}

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
		
		// OPTIONSリクエスト（プリフライトリクエスト）の処理
		if (request.method.toUpperCase() === 'OPTIONS' && url.pathname === '/api/title') {
			return new Response(null, {
				status: 200,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type'
				}
			})
		}
		
		// POSTリクエストの場合は画像タイトル生成API
		if (request.method.toUpperCase() === 'POST' && url.pathname === '/api/title') {
			try {
				const body = JSON.parse(await request.text())
				const { image_base64 } = body as RequestBody
				
				if (!image_base64) {
					return new Response(JSON.stringify({ error: '画像データが提供されていません' }), {
						status: 400,
						headers: { 
							'Content-Type': 'application/json',
							'Access-Control-Allow-Origin': '*',
							'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
							'Access-Control-Allow-Headers': 'Content-Type'
						}
					})
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

				return new Response(JSON.stringify({ titles }), {
					headers: { 
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type'
					},
				})
			} catch (error) {
				console.error('Error processing request:', error)
				return new Response(JSON.stringify({ error: 'リクエスト処理中にエラーが発生しました' }), {
					status: 500,
					headers: { 
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type'
					}
				})
			}
		}
		
		// GETリクエストの場合は静的ファイルを提供
		if (request.method === 'GET') {
			// ルートパスの場合はindex.htmlを提供
			if (url.pathname === '/') {
				const indexRequest = new Request(new URL('/index.html', request.url))
				return env.ASSETS.fetch(indexRequest)
			}
			
			// その他の静的ファイルを提供
			return env.ASSETS.fetch(request)
		}
		
		// その他のHTTPメソッドは許可しない
		return new Response(`Method ${request.method} not allowed`, { 
			status: 405,
			headers: {
				'Content-Type': 'text/plain',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type'
			}
		})
	},
} 