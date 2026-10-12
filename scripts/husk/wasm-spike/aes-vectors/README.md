<!--
SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
-->

# AES vectors

The browser has no synchronous AES — .NET's browser cryptography is
SubtleCrypto, which is asynchronous only, so `Aes.Create()` succeeds and then
`CreateDecryptor` throws `PlatformNotSupportedException`. The fork therefore
carries a managed AES-CBC in
`src/System.Management.Automation/security/HuskAes.cs`, because
`ConvertTo-SecureString -Key` is how a real sample carries an encrypted second
stage.

Hand-written crypto is only as good as its test, and this is that test. It runs
on ordinary Linux .NET, **where the real AES works**, and checks the managed
implementation two ways:

- the FIPS-197 appendix C known-answer vectors for AES-128, AES-192 and
  AES-256, which between them exercise the S-box, the key expansion, every
  round and both directions;
- 147 comparisons against `System.Security.Cryptography.Aes` over every
  plaintext length from 0 to 48 bytes and all three key sizes, encrypting and
  round-tripping through the same `CryptoStream` plumbing `SecureStringHelper`
  uses — which is what caught the real bug: `CryptoStream` does not reserve the
  final block for `TransformFinalBlock`, so a padded decryptor has to hold it
  back itself or it hands the caller its PKCS7 bytes as plaintext.

Run it against the fork's copy of the file:

```bash
cp <fork>/src/System.Management.Automation/security/HuskAes.cs .
dotnet run -c Release
```

It exits non-zero on any mismatch. `HuskAes.cs` is not committed here because
it belongs to the fork; copy it in, as above.
