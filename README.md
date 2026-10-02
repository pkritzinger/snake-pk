# Snake

A web-based remake of Snake II from the Nokia 3310. The game runs on a true 84 × 48 pixel LCD, rendered inside a photo of the phone, with a green backlight and glass glare.

**Play:** https://pkritzinger.github.io/snake-pk/ or open `index.html` in any browser. No build step and no dependencies.

## Controls

| Action        | Keyboard                           | On the phone                         |
|---------------|------------------------------------|--------------------------------------|
| Steer         | Arrow keys, WASD, or 2 / 4 / 6 / 8 | Keys 2 / 4 / 6 / 8 or swipe the screen |
| Start / OK    | Enter or 5                         | Key 5, Navi key, or tap the screen   |
| Pause         | Space or P                         | C key (left)                         |
| Change speed  | L                                  | Scroll key (right)                   |

## Rules

- Eat the food to grow. Each bite is worth as many points as the current level (1–9).
- The walls wrap around, as in the original.
- After every 5th bite a bonus bug shows up for a short time. The faster you catch it, the more points you get.
- You lose if you run into yourself.
- Your high score and chosen level are saved in the browser.
