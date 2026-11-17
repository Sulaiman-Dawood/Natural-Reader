# Natural Reader

A Chrome extension that reads web pages aloud in a natural voice and underlines each sentence as it's spoken. Bring your own voice service key, or run a voice model locally.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Open the extension's **Settings**, pick a voice service, paste your key, and press **Play test**.

## Use

- **Read:** select text (or nothing, for the whole article), then use **Read aloud** in the popup or right-click menu, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.
- **Pause / resume:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, or <kbd>Space</kbd> in the popup.
- **Stop:** <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>.
- **Move around:** click any sentence on the page to jump to it, or use ⏮ ⏭ in the popup.

## Voice services

Groq, Gemini, OpenAI, ElevenLabs, OpenRouter, Local (no key), or any OpenAI-style API (Custom).

For Local, run [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI):

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

## Privacy

Keys stay in your browser. Text goes only to the service you pick, or nowhere with Local. No accounts, no tracking.

## License

MIT. See [LICENSE](LICENSE).
