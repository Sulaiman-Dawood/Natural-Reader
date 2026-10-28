<p align="center">
  <img src="icons/icon128.png" width="96" alt="Natural Reader icon">
</p>

# Natural Reader

Natural Reader speaks aloud any text on any webpage within any Chromium-based browser, including Chrome, Edge, or Brave, using a natural-sounding voice.

You bring your own voice service key. Your text only goes to the service you choose.

## Getting started

1. Download this project, or clone it with GitHub.
2. Open `chrome://extensions` and turn on **Developer mode** in the top right.
3. Click **Load unpacked** and select the `natural-reader` folder.
4. Click the Natural Reader icon in your toolbar, open **Settings**, choose a voice service, paste your key, and press **Play test**.

If you hear the test voice, you're all set.

## How to use it

There are three ways to start reading:

- **Highlight and right-click:** highlight some text, right-click, and choose **Read aloud**. If nothing is highlighted, it reads the whole page.
- **Use a keyboard shortcut:** set one in your browser's extension shortcut settings (in Chrome, go to `chrome://extensions/shortcuts`), then press it any time to start reading.
- **Use the toolbar icon:** click the Natural Reader icon in your toolbar and press **Read aloud**. If you don't see the icon, click the puzzle piece icon and pin Natural Reader.

To stop, right-click and choose **Stop reading**, or click **Stop** in the toolbar popup.

## Voice services

- Gemini
- Groq
- OpenRouter
- OpenAI
- Custom

Free plans have usage limits. Reading a very long page can use up a free allowance quickly, so Gemini is a good choice for longer articles.

## Your privacy

Your keys are saved only in your browser. Text is sent only to the service you picked. There are no accounts, no tracking, and no servers run by this project.

## A quick heads-up

This project was built with AI assistance, sometimes called "vibe coding." It works in my testing, but it hasn't been tried on every website or with every voice service yet. If something breaks, please open an issue. Feedback and suggestions are very welcome.

## License

MIT License. See [LICENSE](LICENSE) for details.
