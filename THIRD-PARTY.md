# Third-party code

The project licence in [`LICENSE`](LICENSE) covers code written for Mo4n6 Tools. It does not cover third-party code that ships alongside it.

No third-party code is vendored into this repository. The files below enter the picture only in the built output under `dist/`, which is what GitHub Pages serves.

## Not covered by the project licence

| Where | What | Licence |
|---|---|---|
| `dist/assets/mp3-encoder-*.js` | `lamejs` MP3 encoder | LGPL-3.0 |
| `dist/assets/kokoro-*.js` | `kokoro-js`, `@huggingface/transformers` | Apache-2.0 |
| `dist/assets/*.wasm` | ONNX Runtime WebAssembly build | MIT |
| other `dist/assets/*.js` | bundled runtime dependencies | see the tally below |

`public/dead-letter.html` contains no third-party code at all. It is entirely covered by the project licence, which is why it carries its own header.

## The LGPL component needs attention

`lamejs` is **LGPL-3.0**, and it is the one dependency whose terms reach past its own file.

The build already isolates it: `vite.config.ts` routes `lamejs` and the MP3 encoder adapter into a dedicated `mp3-encoder` chunk rather than inlining it across the bundle. That separation is deliberate and should be preserved, because the LGPL expects a recipient to be able to replace the library with their own version.

Anyone distributing a build of this project should be prepared to supply the `lamejs` source on request. It is available at <https://github.com/zhuker/lamejs>.

If MP3 export is ever dropped, or moved entirely onto the `@ffmpeg/ffmpeg` path already present in `src/tts/`, this obligation goes away with it. Note that `@ffmpeg/ffmpeg` is MIT but loads a separate FFmpeg WebAssembly core whose own licence depends on how that core was built; check it before relying on that path.

`dompurify` is dual licensed as MPL-2.0 or Apache-2.0. This project takes it under **Apache-2.0**, so no reciprocal obligation applies.

## Runtime dependency licence tally

Packages reachable from `dependencies` in `package.json`:

| Licence | Packages | Examples |
|---|---|---|
| MIT | 113 | @asamuzakjp/css-color, @csstools/css-calc, @csstools/css-color-parser, @csstools/css-parser-algorithms, @csstools/css-tokenizer, @ffmpeg/ffmpeg, and 107 more |
| BSD-3-Clause | 15 | @protobufjs/aspromise, @protobufjs/base64, @protobufjs/codegen, @protobufjs/eventemitter, @protobufjs/fetch, @protobufjs/float, and 9 more |
| Apache-2.0 | 9 | @huggingface/transformers, @mozilla/readability, detect-libc, flatbuffers, kokoro-js, long, and 3 more |
| ISC | 8 | @isaacs/fs-minipass, guid-typescript, json-stringify-safe, lru-cache, saxes, semver, and 2 more |
| BlueOak-1.0.0 | 3 | chownr, minipass, tar |
| BSD-2-Clause | 2 | entities, webidl-conversions |
| (MPL-2.0 OR Apache-2.0) | 1 | dompurify |
| MIT-0 | 1 | @csstools/color-helpers |
| (MIT OR CC0-1.0) | 1 | type-fest |
| LGPL-3.0 | 1 | lamejs |

Regenerate this tally rather than editing it by hand when dependencies change.

## Models

Text-to-speech model weights are covered separately. See [`docs/licenses/tts-manifest.json`](docs/licenses/tts-manifest.json).
