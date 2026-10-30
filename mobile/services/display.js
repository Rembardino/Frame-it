/** Keep the game full width; only its controls need to avoid a landscape cutout. */
export function webSafeAreaScript({ left, right }) {
  return `document.documentElement.style.setProperty('--safe-left', '${left}px');document.documentElement.style.setProperty('--safe-right', '${right}px');true;`;
}
