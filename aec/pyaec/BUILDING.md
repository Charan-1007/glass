# Building

Use [uv](https://astral.sh/blog/uv)

```console
cargo build -p libaec --release
cp -rf ../target/release/libaec.dylib src/pyaec/
WHEEL_TAG="py3-none-macosx_11_0_arm64" uv build
```

Publish

```console
export UV_PUBLISH_TOKEN="..."
uv publish
```

Installing once published

```console
uv run --with pyaec --refresh-package pyaec --no-project -- python -c "import pyaec"
```
