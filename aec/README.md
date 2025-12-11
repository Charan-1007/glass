# aec

[![Crates](https://img.shields.io/crates/v/aec-rs?logo=rust&color=F07B3C)](https://crates.io/crates/aec-rs/)
[![PyPi Version](https://img.shields.io/pypi/v/pyaec?color=36719F&logo=python)](https://pypi.org/project/pyaec/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)


Acoustic echo cancellation in Rust based on [speexdsp](https://github.com/xiph/speexdsp)

## Features

- 🎶 Echo cancellation with a simple function call
- 🌀 Noise suppression for cleaner audio
- 🔧 Optimized for realtime performance
- 🦀 Rust and 🐍 Python support
- 🔗 Easy integration with C/C++ (or any other language) via C API
- 📦 Precompiled library and C header files available in the [releases](https://github.com/thewh1teagle/aec/releases/latest)

## Supported Platforms

| Platform    | Architecture | Supported   |
| ----------- | ------------ | ----------  |
| **Windows** | x86, ARM64   | ✔️          |
| **Linux**   | x86, ARM64   | ✔️          |
| **macOS**   | x86, ARM64   | ✔️          |
| **Android** | ARM64        | ✔️          |
| **iOS**     | ARM64        | ✔️          |
| **WASM**    | wasm32       | ✔️          |
| **RISC-V**  | RISC-V64     | ✔️          |

# Install

Rust 🦀

```console
cargo add aec-rs
```

Python 🐍

```console
pip install pyaec
```

## Examples

See [examples](examples)

## Building

See [building](BUILDING.md)
