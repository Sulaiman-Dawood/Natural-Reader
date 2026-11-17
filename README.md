<p align="center">
  <img src="icons/icon128.png" width="96" alt="Natural Reader icon">
</p>

<h1 align="center">Natural Reader</h1>

<p align="center">
  Listen to any web page in a natural voice, and follow along as each sentence is underlined.<br>
  Works in Chrome, Edge and Brave. Bring your own voice service, or run one on your own computer.
</p>

---

## Features

- **Read anything aloud.** Read your selection, or the whole article when nothing is selected. Menus, footers and comment boxes are skipped.
- **Follow along.** The sentence being spoken is underlined on the page and kept in view.
- **Starts fast.** The first sentence plays within moments, while the rest loads in the background.
- **Your choice of voice.** Use Gemini, Groq, OpenAI, ElevenLabs or OpenRouter, a voice model on your own computer, or any OpenAI-style service.
- **Control while listening.** Pause and resume, skip back or forward a sentence, or click any sentence on the page to jump to it. Change the speed mid-sentence, and see what's being read in the popup.
- **Private by design.** No accounts, no tracking, no servers of our own. Your text goes only to the service you pick.

## Install

1. Download this project, or clone it with Git.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `natural-reader` folder.
4. Pin Natural Reader from the puzzle-piece menu so its icon stays in your toolbar.

## Set up a voice

1. Click the Natural Reader icon, then the gear to open **Settings**.
2. Pick a voice service and paste your API key. The link under the key box takes you to the right page to get one.
3. Choose a model and a voice. Press **Preview** next to any voice to hear it first.
4. Press **Play test**. If you hear it, you're ready.

Settings save automatically.

## Reading

| How | Read | Pause / resume | Stop |
| --- | --- | --- | --- |
| Toolbar popup | **Read aloud** | **Pause** / **Resume**, or <kbd>Space</kbd> | ■ |
| Right-click | **Read aloud** | | **Stop reading** |
| Keyboard | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> |

**Moving around while it reads:**

- **Click any sentence** on the page to jump straight to it. Links and buttons still work as usual.
- **Skip back or forward** a sentence with the ⏮ and ⏭ buttons in the popup, or the ← and → keys while the popup is open.
- Shortcuts for skipping aren't set by default. Add them, or change any other shortcut, under **Settings → While reading → Change**.

You can pause for as long as you like. If the browser closes the audio player during a long pause, **Resume** starts again from the same sentence.

Underlining and auto-scroll can be turned off in the popup or in Settings. They don't work on pages where extensions can't run scripts, such as PDFs and the browser's own pages. Selected text on those pages is still read aloud.

## Voice services

| Service | Key needed | Good to know |
| --- | --- | --- |
| Groq | Yes | Very fast. Free plan limits are low for long pages. |
| Gemini | Yes | 30 voices. A good choice for long articles. |
| OpenAI | Yes | Natural and steerable voices. |
| ElevenLabs | Yes | Lifelike voices. Your own voices load automatically. |
| OpenRouter | Yes | One key for many models. |
| Local | No | Runs on your computer. Your text never leaves it. |
| Custom | Depends | Any service with an OpenAI-style speech API. |

Free plans have usage limits. If you hit a rate limit, Natural Reader waits and retries on its own before giving up.

For **Custom**, or any service at a different address, Settings shows an **Allow access** button. Your browser asks once for permission to contact that address.

### Running a voice on your own computer

[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) is an easy place to start. With Docker installed, run:

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Then pick **Local** in Settings and press **Play test**. If your server uses a different address, change it under **Settings → Advanced**.

## Privacy

- API keys are stored only in your browser.
- Text is sent only to the voice service you choose, or stays on your computer with Local.
- The underline is drawn by your browser. Nothing on the page is changed or sent anywhere.
- There are no accounts, no analytics and no servers run by this project.

## Troubleshooting

- **"The API key was rejected"**: check the key in Settings, and that it belongs to the service you picked.
- **"Could not reach the server"**: for Local, make sure the voice server is running. For Custom, press **Allow access** in Settings.
- **Nothing happens on a page**: browser pages and the extension store block extensions. Try a normal website.
- **Rate limit errors**: wait a minute, or switch to a service with a larger free allowance.

## Project files

| File | What it does |
| --- | --- |
| `background.js` | Starts and stops reading, and connects the page, popup and audio player. |
| `content.js` | Runs on the page only when reading starts. It collects the text and draws the underline. |
| `offscreen.js` | Splits text into sentences, calls the voice service and plays the audio. |
| `popup.*`, `options.*` | The toolbar popup and the Settings page. |
| `shared.js`, `styles.css` | Voice service presets, and the shared design. |

## A note on how this was made

This project was built with AI assistance. It works in my testing, but it hasn't been tried on every site or with every voice service. If something breaks, please open an issue. Feedback and ideas are welcome.

## License

MIT. See [LICENSE](LICENSE).
