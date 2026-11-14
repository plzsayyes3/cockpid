# iOS実機開発ログ

記録日: 2026-11-14（日本時間）。認証情報、Team ID、端末識別番号、個人データを記録しない。

## 初期プロジェクトとGit反映

- 既存checkoutに未コミットのWeb変更とmainとの差分があったため、変更を保持して `origin/main` (`a088558`) から別worktreeを作成。
- `ios/README.md`、iOSシェル計画、Swiftソース2件を確認。既存HTTPSサイトを表示するSwiftUI + WKWebView構成を採用。
- `WorkbenchNative.xcodeproj` に2件のSwiftソースを組み込み。iOS 17.0以降、永続WKWebView、既存のWebデータ形式を維持。
- プロジェクト構文と差分を確認。初回はCommand Line ToolsのみでiOSビルド不可。
- ユーザーの指示で今回の変更だけをコミットし、強制Pushを使わずmainへ反映: `98491c9`。

## Xcode・署名・実機転送

- ユーザーがXcodeをインストール。Xcode 27.2 (27B52)、iOS 27.2 SDKを確認。
- Xcodeでプロジェクトを開き、generic iOS Debugの署名なしビルド成功。Swiftコンパイル修正は不要。
- Team未選択で署名ビルド失敗。ユーザーがXcodeでPersonal Teamを選択。
- `-allowProvisioningUpdates` を指定した署名付きビルド成功。
- 最初の実機転送はDeveloper Mode無効によるDDI準備エラーで停止。
- ユーザーがDeveloper Modeを有効化して再起動。転送再試行でインストール成功。
- 起動はiOSの署名・信頼確認で拒否。ユーザーが端末で開発者を信頼し、再試行で起動成功。
- ユーザーが画面への反映を確認。アプリ内の個人データ読み書きは代理で実行していない。
- 段階ごとにREADMEへ記録しmainに反映: `d097d6d`, `c1e8769`, `1ca6e43`, `2279529`。

## 無線接続

- ユーザーがUSBケーブルを外した後、端末はconnected / pairedを維持。
- `devicectl device info details` で接続方式 `localNetwork` を確認。
- 無線で実機スクリーンショット取得とアプリ起動も成功。

## DUO表示調整（進行中）

- 実機画面は1398 × 2034ピクセル。作業台ホームの右にOSの時計・通信表示用領域、下にホームインジケータを確認。
- 現在のSwiftUIはsafe areaを尊重し、WKWebViewの自動content insetは無効。Web側にもvisual viewportとsafe areaの計算があるため、実機を見ず固定オフセットを追加しない。
- 手帳モードの実機表示を確認してから調整し、ビルド・無線転送・変更前後比較を行う。
- スクリーンショットには個人情報が含まれ得るため、一時ファイルとして扱いGitには追加しない。
- Xcodeが作成したローカルTeam設定とxcuserdataは保持し、公開コミットに含めない。

## 未完了の確認

- DUO手帳の位置、右端操作帯、折りたたみ状態・向きによるレイアウト。
- キーボード表示中の入力位置、IME、スクロール。
- 本人による非破壊的なGitHub読み書きテスト。
