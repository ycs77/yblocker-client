# yBlocker Client

產生 CA key：

```bash
mkdir certs
MSYS_NO_PATHCONV=1 openssl req -x509 -new -nodes -keyout certs/testCA.key -sha256 -days 365 -out certs/testCA.pem -subj '/CN=Mockttp Testing CA - DO NOT TRUST'
```

轉換成 `.crt` 檔：

```bash
openssl x509 -outform der -in certs/testCA.pem -out certs/testCA.crt
```

啟動開發用 proxy server：

```bash
yarn
yarn dev
```

編譯 proxy server：

```bash
yarn build
```

用 Powershell 啟動：

```
Powershell.exe -File C:\...\yblocker.ps1
```
