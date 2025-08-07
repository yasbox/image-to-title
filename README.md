# Image to Title - AI画像タイトル生成アプリ

**AIが画像を分析して魅力的なタイトルを自動生成するWebアプリケーション**です。

## 概要

このアプリケーションは、OpenAIの最新AI技術を活用して、アップロードされた画像の内容を深く分析し、魅力的で適切なタイトルを自動生成します。AIが画像の構図、色合い、雰囲気、被写体などを総合的に判断して、英語タイトル5つと日本語訳を提案します。

## 機能

- 🤖 **AI画像分析**: OpenAI APIによる高度な画像認識・分析
- 📝 **自動タイトル生成**: AIが画像内容を理解して魅力的なタイトルを5つ生成
- 🌐 **多言語対応**: 英語タイトル + 日本語訳の自動提供
- 🖼️ **簡単アップロード**: ドラッグ&ドロップまたはクリックでの画像アップロード
- 🔐 **セキュア認証**: パスワード認証機能
- ⚡ **高速処理**: Cloudflare Workers上での高速AI処理
- 📊 **レート制限**: AI API使用量の適切な管理

## AI技術の詳細

- **画像認識**: OpenAIの最新画像分析モデルを使用
- **自然言語処理**: 画像内容を自然なタイトルに変換
- **多言語生成**: 英語と日本語の両方でタイトルを生成
- **文脈理解**: 画像の雰囲気や構図を考慮したタイトル作成

## 技術スタック

- **バックエンド**: Cloudflare Workers (TypeScript)
- **フロントエンド**: HTML, CSS, JavaScript
- **AI**: OpenAI API
- **認証**: セッション管理（KVストレージ）
- **デプロイ**: Wrangler

## セットアップ

### 前提条件

- Node.js (v18以上)
- npm または yarn
- Cloudflare アカウント
- OpenAI API キー

### インストール

1. リポジトリをクローン
```bash
git clone <repository-url>
cd image-to-title
```

2. 依存関係をインストール
```bash
npm install
```

3. 環境変数を設定
```bash
# .dev.vars.example を .dev.vars にコピー
cp .dev.vars.example .dev.vars

# .dev.vars を編集して実際の値を設定
```

### 環境変数

`.dev.vars` ファイルに以下の環境変数を設定してください：

```bash
OPENAI_API_KEY=sk-your-actual-openai-api-key
API_KEYS=your-actual-api-keys
FRONTEND_API_KEY=your-actual-frontend-key
PAGE_PASSWORD=your-actual-password
```

### 開発サーバーの起動

```bash
npm run dev
```

アプリケーションは `http://localhost:8787` で起動します。

## 使用方法

1. ブラウザでアプリケーションにアクセス
2. パスワードを入力してログイン
3. 画像をアップロード（ドラッグ&ドロップまたはクリック）
4. 「タイトルを生成」ボタンをクリック
5. **AIが画像を分析中...** の表示が表示される
6. **AIが生成した5つのタイトル候補**（英語+日本語訳）を確認

### AIの分析プロセス

1. **画像認識**: AIが画像の内容、被写体、構図を分析
2. **文脈理解**: 画像の雰囲気、色合い、感情を読み取り
3. **タイトル生成**: 分析結果を基に魅力的な英語タイトルを5つ生成
4. **翻訳**: 各英語タイトルに対応する日本語訳を自動生成
5. **結果表示**: 整理された形式でタイトル候補を表示

## デプロイ

### 本番環境へのデプロイ

1. Cloudflare Workersの設定を確認
2. 環境変数を本番環境に設定：
```bash
wrangler secret put PAGE_PASSWORD
wrangler secret put API_KEYS
wrangler secret put FRONTEND_API_KEY
wrangler secret put OPENAI_API_KEY
```

3. デプロイ実行：
```bash
npm run deploy
```

## 開発

### テスト

```bash
npm test
```

### ビルド

```bash
npm run build
```

## セキュリティ

- 機密情報は `.dev.vars` ファイル（開発環境）または `wrangler secret`（本番環境）で管理
- セッション管理による認証機能
- レート制限によるAPI保護
- CORS設定によるセキュリティ強化

## ライセンス

このプロジェクトはプライベートプロジェクトです。

## 貢献

プルリクエストやイシューの報告は歓迎します。
