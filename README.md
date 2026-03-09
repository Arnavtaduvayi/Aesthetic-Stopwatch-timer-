## Aesthetic Time

A very minimal, black-and-grey time screen with three modes:

- **Current time**: Shows the current time with hours, minutes, and seconds.
- **Stopwatch**: Start/pause/reset stopwatch with the same aesthetic display.
- **Timer**: Countdown from a configurable duration.

Each time unit has its own micro-animation:

- **Hours**: Rolls vertically when changing.
- **Minutes**: Flips in 3D when changing.
- **Seconds**: Slides horizontally when changing.

### Getting Started

- **Option 1 (simplest)**:  
  Open `index.html` directly in your browser.

- **Option 2 (with a tiny dev server)**:
  1. Install dependencies:
     ```bash
     npm install
     ```
  2. Start a static file server:
     ```bash
     npm run start
     ```
  3. Open the printed URL in your browser.

### Project Structure

- **index.html**: Main HTML layout and root container.
- **style.css**: Minimal black/grey theme and animations.
- **main.js**: Mode switching, timekeeping logic, and animation triggers.

