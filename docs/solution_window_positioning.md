# Window Positioning Solution: The Overscan Strategy

## The Problem
The Electron window was consistently shifting to the right on macOS, preventing the AI pill container from being perfectly centered. This occurred because:
1.  **macOS Safe Areas:** The OS often prevents windows from covering the Dock or Menu Bar area, or adds an offset to "safe" coordinates (e.g., starting at x=25 instead of x=0).
2.  **Coordinate Clamping:** Attempts to force `x: 0` were often overridden by the OS to avoid hidden areas, resulting in a visible gap on the left and the window shifting right.
3.  **Resolution Changes:** Changing resolutions or connecting external monitors exacerbated this, as the "work area" dimensions changed dynamically.

## The Solution: Overscan Strategy
Instead of trying to fit the window *exactly* to the screen (which is prone to OS interference), we intentionally make the window **larger than the screen** and position it at **negative coordinates**.

### Implementation Details

#### 1. Main Process (`src/main/index.ts`)
We force the window to be wider than the screen and start "off-screen" to the left.

```typescript
const { width, height } = screen.getPrimaryDisplay().bounds

// Strategy:
// 1. Width = Screen Width + 200px (Extra buffer)
// 2. X = -100px (Shift left by half the buffer)
// Result: The window covers the full screen with 100px of "invisible" window on both left and right sides.

mainWindow.setBounds({
  x: -100,
  y: 0,
  width: width + 200,
  height: height
})
```

**Why this works:**
-   **Overcomes OS Constraints:** By requesting a negative X coordinate (`-100`), we force the window to extend past the left edge. Even if macOS clamps it slightly, the extra width ensures the *visible* screen area is fully covered by the window.
-   **Eliminates Gaps:** Since the window is wider than the screen, there are no gaps on the left or right.

#### 2. Renderer Process (`src/renderer/src/App.tsx`)
Since the window is now centered relative to the screen (with equal overscan on both sides), the mathematical center of the window aligns with the visual center of the screen.

```tsx
<div
  className="fixed bottom-10 pointer-events-none"
  style={{ left: '50%', transform: 'translateX(-50%)' }}
>
  {/* Pill Content */}
</div>
```

**Why this works:**
-   `left: 50%` places the element at the exact center of the *window*.
-   Since the window extends 100px to the left and 100px to the right of the screen, the window's center is exactly the screen's center.

## Summary
By making the window "too big" and centering it over the screen, we bypass the delicate and error-prone process of trying to match exact screen bounds. This "brute force" alignment ensures the UI is always centered, regardless of notches, menu bars, or dock positioning.
