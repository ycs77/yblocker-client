# yBlocker Client

Generate CA key:

```bash
mkdir certs
MSYS_NO_PATHCONV=1 openssl req -x509 -new -nodes -keyout certs/testCA.key -sha256 -days 365 -out certs/testCA.pem -subj '/CN=Mockttp Testing CA - DO NOT TRUST'
```

Change to `.crt` file:

```bash
openssl x509 -outform der -in certs/testCA.pem -out certs/testCA.crt
```

Start proxy server:

```bash
node yblocker.js
```
