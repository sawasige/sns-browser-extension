# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ビルドコマンド

```bash
npm run build    # 拡張機能をビルド（TypeScriptチェック + Viteビルド）
npm run dev      # 開発サーバー起動
```

ビルド後、`dist/` フォルダをChromeの拡張機能としてロード（chrome://extensions で「パッケージ化されていない拡張機能を読み込む」）。

## アーキテクチャ

Instagram、Twitter(X)、Threadsのフォロワー管理用Chrome拡張機能（Manifest V3）。

### コンポーネント構成

```
[SNSページ] → [Content Script] → [Service Worker] → [サイドパネルUI]
                                      ↓
                              Chrome Storage
```

### 主要コンポーネント

**Content Scripts** (`src/content/*.ts`)
- SNSページ上で動作するプラットフォーム別スクレイパー
- IIFE形式で個別ビルド（ChromeのContent ScriptはESモジュール非対応のため）
- ユーザーリスト収集、「フォローされています」検出、最終投稿日取得を担当
- `chrome.runtime.sendMessage` でService Workerと通信

**Service Worker** (`src/background/service-worker.ts`)
- Content Scriptとサイドパネルのメッセージルーター
- `chrome.scripting.executeScript` でContent Scriptを動的注入
- Chrome Storage APIでデータ永続化

**サイドパネル** (`src/sidepanel/`)
- React + Tailwind CSS のUI
- プラットフォーム別・条件別のフィルタリング付き結果表示

### メッセージフロー

Content Scriptが送信するメッセージ:
- `SCAN_PROGRESS` - スキャン中の進捗更新
- `ACCOUNT_FOUND` - 条件に合致するアカウント検出時のリアルタイム通知
- `SCAN_COMPLETE` - 全結果を含む完了通知
- `SCAN_ERROR` - エラーメッセージ（429レート制限を含む）

### 重要な制約

**日付のシリアライズ**: Chromeメッセージ経由で渡すと Date は文字列になる。`src/utils/date.ts` の関数は `Date` と `string` 両方を受け付ける。

**レート制限**: Instagram APIは多数リクエストで429を返す。429検出時は即座にエラーをスローしてユーザーに通知。

**Twitter制限**: TwitterのAPIから最終投稿日を確実に取得できない。Twitterでは「フォローバックなし」検出のみ動作。

### Viteビルド設定

`vite.config.ts` の特殊処理:
- メインビルド: サイドパネルとService Worker
- 別途IIFEビルド: Content Scripts（ネストした `build()` 呼び出し）
- ビルド後: manifest.jsonとアイコンをdistにコピー
