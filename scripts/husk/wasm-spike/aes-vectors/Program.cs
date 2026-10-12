using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Management.Automation.Internal;

internal static class Program
{
    private static byte[] Hex(string hex) =>
        Enumerable.Range(0, hex.Length / 2).Select(i => Convert.ToByte(hex.Substring(i * 2, 2), 16)).ToArray();

    private static string Hex(byte[] bytes) => Convert.ToHexString(bytes).ToLowerInvariant();

    private static int _failures;

    private static void Check(string what, string expected, string actual)
    {
        bool ok = expected == actual;
        if (!ok) { _failures++; }
        Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {what}");
        if (!ok) { Console.WriteLine($"      expected {expected}\n      actual   {actual}"); }
    }

    private static int Main()
    {
        // FIPS-197 appendix C known-answer tests for the raw block cipher.
        foreach (var (key, cipher) in new[]
        {
            ("000102030405060708090a0b0c0d0e0f", "69c4e0d86a7b0430d8cdb78070b4c55a"),
            ("000102030405060708090a0b0c0d0e0f1011121314151617", "dda97ca4864cdfe06eaf70a0ec0d7191"),
            ("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "8ea2b7ca516745bfeafc49904b496089"),
        })
        {
            var state = Hex("00112233445566778899aabbccddeeff");
            var expanded = HuskAes.ExpandKey(Hex(key), out int rounds);
            HuskAes.EncryptBlock(state, expanded, rounds);
            Check($"FIPS-197 AES-{key.Length * 4} encrypt", cipher, Hex(state));

            HuskAes.DecryptBlock(state, expanded, rounds);
            Check($"FIPS-197 AES-{key.Length * 4} decrypt", "00112233445566778899aabbccddeeff", Hex(state));
        }

        // Against the real thing, through the same CryptoStream plumbing
        // SecureStringHelper uses, over every length that exercises padding.
        var random = new Random(20261011);
        foreach (int keySize in new[] { 16, 24, 32 })
        {
            for (int length = 0; length <= 48; length++)
            {
                var key = new byte[keySize];
                var iv = new byte[16];
                var plain = new byte[length];
                random.NextBytes(key);
                random.NextBytes(iv);
                random.NextBytes(plain);

                using var aes = Aes.Create();
                aes.Mode = CipherMode.CBC;
                aes.Padding = PaddingMode.PKCS7;

                string reference;
                using (var transform = aes.CreateEncryptor(key, iv))
                using (var target = new MemoryStream())
                {
                    using (var stream = new CryptoStream(target, transform, CryptoStreamMode.Write))
                    {
                        stream.Write(plain, 0, plain.Length);
                    }

                    reference = Hex(target.ToArray());
                }

                string managed;
                using (var transform = new HuskAesTransform(key, iv, encrypting: true))
                using (var target = new MemoryStream())
                {
                    using (var stream = new CryptoStream(target, transform, CryptoStreamMode.Write))
                    {
                        stream.Write(plain, 0, plain.Length);
                    }

                    managed = Hex(target.ToArray());
                }

                if (reference != managed)
                {
                    Check($"AES-{keySize * 8}-CBC encrypt, {length} bytes", reference, managed);
                    continue;
                }

                // And back, reading through CryptoStream the way Decrypt does.
                using (var transform = new HuskAesTransform(key, iv, encrypting: false))
                using (var source = new MemoryStream(Convert.FromHexString(managed)))
                using (var target = new MemoryStream())
                {
                    using (var stream = new CryptoStream(source, transform, CryptoStreamMode.Read))
                    {
                        stream.CopyTo(target);
                    }

                    Check($"AES-{keySize * 8}-CBC round trip, {length} bytes", Hex(plain), Hex(target.ToArray()));
                }
            }
        }

        Console.WriteLine(_failures == 0
            ? "\nall vectors agree with System.Security.Cryptography.Aes"
            : $"\n{_failures} FAILURES");
        return _failures == 0 ? 0 : 1;
    }
}
