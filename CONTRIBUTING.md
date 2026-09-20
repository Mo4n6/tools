# Contributing

Thanks for taking an interest. Please read the licensing section before opening a pull request — it is short, and it is not optional.

## Contributor Licence

These tools are published under [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0). Organisations that exceed its thresholds can purchase a separate commercial licence from the maintainer.

That second path only works if every line in the project can be licensed on terms other than PolyForm. Contributions therefore need a grant broad enough to cover both.

**By submitting a contribution to this project, you agree that:**

1. You are the copyright holder in the contribution, or you have the necessary rights to submit it under these terms.
2. You grant the maintainer a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to reproduce, modify, prepare derivative works of, publicly display, distribute and sublicense your contribution — under PolyForm Small Business 1.0.0 **and under any other terms, including proprietary or commercial licence terms**.
3. You grant the maintainer and every recipient of the software a perpetual, worldwide, non-exclusive, royalty-free, irrevocable patent licence to make, have made, use, offer to sell, sell, import and otherwise transfer your contribution. This covers only those patent claims you can license that are necessarily infringed by your contribution alone, or by the combination of your contribution with this project.
4. You retain copyright in your contribution. This is a licence, not an assignment.
5. If your employer has rights to work you produce, you have confirmed that you may submit the contribution under these terms.
6. Your contribution is provided without warranty of any kind.

If you cannot agree to all six, please open an issue describing the change instead of a pull request. A described bug or a proposed approach is genuinely useful and carries none of this baggage.

The maintainer may decline, revise, or later remove any contribution. Nothing here obliges anyone to merge or keep a change.

## Sign-off

Every commit must carry a `Signed-off-by` line certifying the [Developer Certificate of Origin 1.1](https://developercertificate.org/):

```
git commit -s -m "your message"
```

This produces:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name and a reachable email address. Pull requests with unsigned commits will be asked to amend before review.

The sign-off certifies origin. It does not by itself grant the relicensing and patent rights above — the numbered terms in **Contributor Licence** do that, and submitting a pull request is your agreement to them.

## Third-party code

Do not vendor third-party code into a tool without raising it first. Anything under an external licence has to stay under that licence, which fragments the terms above and can block commercial licensing of that tool entirely.

Copyleft and reciprocal licences (GPL, AGPL, LGPL, SSPL, OSL and similar) are the hard cases: they can impose obligations on the whole distributed work, which is incompatible with selling a commercial licence. Do not introduce one without agreement first.

If a dependency is genuinely unavoidable, say so in the issue and it will be handled deliberately — with an entry in [`THIRD-PARTY.md`](THIRD-PARTY.md) identifying which parts are not covered by the project licence.

## Tool files

Each tool is a self-contained page and must carry its own licence header, because these files get copied out of the repository without the `LICENSE` travelling with them:

```html
<!--
SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
Full terms: https://polyformproject.org/licenses/small-business/1.0.0
Commercial licensing: https://github.com/Mo4n6/tools/issues/new?template=licensing.yml
-->
```

Keep the `Required Notice:` line verbatim. PolyForm requires it to propagate to anyone who receives a copy downstream.

## Trademarks

The project licence covers code. It does not grant rights in the project or tool names — see [`TRADEMARK.md`](TRADEMARK.md).
