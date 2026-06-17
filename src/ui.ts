// Lightweight DOM overlay for HUD elements. Kept as crisp HTML rather than
// in-scene text so the typography stays razor-sharp at any resolution.

export class UI {
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private toastEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private displayedScore = 0;
  private targetScore = 0;
  private toastTimer = 0;

  constructor(root: HTMLElement, onToggleMute: (muted: boolean) => void) {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="hud-top">
        <div class="brand">OVER&nbsp;THE&nbsp;TOP<span>GRAVITY&nbsp;WELLS</span></div>
        <button class="mute" aria-label="Toggle sound">♪</button>
      </div>
      <div class="score-wrap">
        <div class="score-label">SCORE</div>
        <div class="score">0</div>
      </div>
      <div class="combo"></div>
      <div class="toast"></div>
    `;
    root.appendChild(hud);

    this.scoreEl = hud.querySelector('.score')!;
    this.comboEl = hud.querySelector('.combo')!;
    this.toastEl = hud.querySelector('.toast')!;
    this.muteBtn = hud.querySelector('.mute')!;

    let muted = false;
    this.muteBtn.addEventListener('click', () => {
      muted = !muted;
      this.muteBtn.classList.toggle('muted', muted);
      this.muteBtn.textContent = muted ? '♪̶' : '♪';
      onToggleMute(muted);
    });
  }

  addScore(points: number): void {
    this.targetScore += points;
  }

  /** Show the cascade multiplier with a satisfying pop. */
  showCombo(level: number): void {
    if (level < 2) return;
    this.comboEl.textContent = `COMBO ×${level}`;
    this.comboEl.classList.remove('pop');
    // Force reflow so the animation restarts.
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('pop');
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = performance.now() + 1800;
  }

  /** Call every frame to animate the score count-up and time out toasts. */
  update(): void {
    if (this.displayedScore !== this.targetScore) {
      const diff = this.targetScore - this.displayedScore;
      this.displayedScore += Math.max(1, Math.ceil(Math.abs(diff) * 0.12)) * Math.sign(diff);
      if (Math.abs(this.targetScore - this.displayedScore) < 1) this.displayedScore = this.targetScore;
      this.scoreEl.textContent = Math.round(this.displayedScore).toLocaleString();
    }
    if (this.toastTimer && performance.now() > this.toastTimer) {
      this.toastEl.classList.remove('show');
      this.toastTimer = 0;
    }
  }
}
