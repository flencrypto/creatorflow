(() => {
  'use strict';

  const STORAGE_KEY = 'mrflen:analysis-dashboard:history:v1';
  const MAX_HISTORY_ITEMS = 6;

  const ANALYSIS_STEPS = [
    'Checking secure session...',
    'Reading platform context...',
    'Mapping content goals...',
    'Running content intelligence...',
    'Building tactical feedback...',
    'Formatting dashboard output...'
  ];

  function setStatus(statusElement, message) {
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message || '';
    statusElement.dataset.active = message ? 'true' : 'false';
  }

  function setError(errorElement, message) {
    if (!errorElement) {
      return;
    }

    if (message) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
      errorElement.dataset.active = 'true';
    } else {
      errorElement.textContent = '';
      errorElement.classList.add('hidden');
      errorElement.dataset.active = 'false';
    }
  }

  function createElement(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    const childList = Array.isArray(children) ? children : [children];

    if (options.className) {
      element.className = options.className;
    }

    if (options.text !== undefined) {
      element.textContent = options.text;
    }

    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        if (value === undefined || value === null || value === false) {
          return;
        }

        element.setAttribute(key, value === true ? '' : String(value));
      });
    }

    if (options.on) {
      Object.entries(options.on).forEach(([eventName, handler]) => {
        element.addEventListener(eventName, handler);
      });
    }

    childList.forEach((child) => {
      if (child === undefined || child === null) {
        return;
      }

      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });

    return element;
  }

  function injectDashboardStyles() {
    if (document.getElementById('mrflen-analysis-dashboard-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'mrflen-analysis-dashboard-styles';

    style.textContent = `
      :root {
        --flen-bg: #050812;
        --flen-bg-2: #09111f;
        --flen-panel: rgba(10, 18, 34, 0.78);
        --flen-panel-strong: rgba(13, 25, 48, 0.92);
        --flen-border: rgba(125, 211, 252, 0.24);
        --flen-border-hot: rgba(34, 211, 238, 0.56);
        --flen-text: #eef8ff;
        --flen-muted: #92a8bd;
        --flen-cyan: #22d3ee;
        --flen-blue: #60a5fa;
        --flen-purple: #a78bfa;
        --flen-green: #34d399;
        --flen-red: #fb7185;
        --flen-warning: #facc15;
        --flen-radius-xl: 28px;
        --flen-radius-lg: 20px;
        --flen-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
      }
      
      body.flen-dashboard-enhanced {
        min-height: 100vh;
        margin: 0;
        color: var(--flen-text);
        background:
          radial-gradient(circle at 10% 10%, rgba(34, 211, 238, 0.24), transparent 32%),
          radial-gradient(circle at 85% 15%, rgba(167, 139, 250, 0.20), transparent 34%),
          radial-gradient(circle at 50% 90%, rgba(96, 165, 250, 0.16), transparent 38%),
          linear-gradient(135deg, var(--flen-bg), var(--flen-bg-2) 52%, #020617);
        overflow-x: hidden;
      }

      body.flen-dashboard-enhanced::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(125, 211, 252, 0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(125, 211, 252, 0.055) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: radial-gradient(circle at center, black, transparent 78%);
        animation: flenGridDrift 18s linear infinite;
        z-index: 0;
      }

      body.flen-dashboard-enhanced::after {
        content: "";
        position: fixed;
        inset: -20%;
        pointer-events: none;
        background:
          conic-gradient(
            from 180deg,
            transparent,
            rgba(34, 211, 238, 0.08),
            transparent,
            rgba(167, 139, 250, 0.08),
            transparent
          );
        filter: blur(30px);
        animation: flenAuroraSpin 24s linear infinite;
        z-index: 0;
      }

      .hidden {
        display: none !important;
      }

      .flen-shell {
        position: relative;
        z-index: 1;
        width: min(1440px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      .flen-hero {
        position: relative;
        display: grid;
        grid-template-columns: 1.35fr 0.65fr;
        gap: 22px;
        align-items: stretch;
        margin-bottom: 22px;
      }

      .flen-hero-card,
      .flen-panel,
      .flen-metric-card {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--flen-border);
        background:
          linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(8, 13, 26, 0.70)),
          radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 35%);
        box-shadow: var(--flen-shadow);
        backdrop-filter: blur(18px);
      }

      .flen-hero-card {
        min-height: 245px;
        padding: 32px;
        border-radius: var(--flen-radius-xl);
      }

      .flen-hero-card::before,
      .flen-panel::before,
      .flen-metric-card::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        transform: translateX(-100%);
        animation: flenPanelSweep 5.5s ease-in-out infinite;
      }

      .flen-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 18px;
        padding: 8px 12px;
        border: 1px solid rgba(34, 211, 238, 0.30);
        border-radius: 999px;
        color: #b8f3ff;
        background: rgba(34, 211, 238, 0.08);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .flen-pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--flen-green);
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
        animation: flenPulseDot 1.7s ease-out infinite;
      }

      .flen-title {
        margin: 0;
        max-width: 820px;
        font-size: clamp(34px, 5vw, 68px);
        line-height: 0.95;
        letter-spacing: -0.06em;
      }

      .flen-title span {
        background: linear-gradient(90deg, #ffffff, #a7f3ff, #b7b7ff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .flen-subtitle {
        max-width: 760px;
        margin: 18px 0 0;
        color: var(--flen-muted);
        font-size: 16px;
        line-height: 1.7;
      }

      .flen-command-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 24px;
      }

      .flen-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 7px 12px;
        border: 1px solid rgba(148, 163, 184, 0.20);
        border-radius: 999px;
        color: #dcecff;
        background: rgba(15, 23, 42, 0.62);
        font-size: 12px;
        font-weight: 700;
      }

      .flen-orbit-card {
        position: relative;
        min-height: 245px;
        display: grid;
        place-items: center;
        border-radius: var(--flen-radius-xl);
        border: 1px solid var(--flen-border);
        background:
          radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.16), transparent 38%),
          linear-gradient(145deg, rgba(8, 13, 26, 0.92), rgba(15, 23, 42, 0.70));
        box-shadow: var(--flen-shadow);
        overflow: hidden;
      }

      .flen-orbit {
        position: relative;
        width: 190px;
        height: 190px;
        border-radius: 50%;
        border: 1px solid rgba(34, 211, 238, 0.26);
        box-shadow:
          inset 0 0 34px rgba(34, 211, 238, 0.12),
          0 0 44px rgba(34, 211, 238, 0.08);
        animation: flenOrbitFloat 4.5s ease-in-out infinite;
      }

      .flen-orbit::before,
      .flen-orbit::after {
        content: "";
        position: absolute;
        inset: 18px;
        border-radius: 50%;
        border: 1px dashed rgba(167, 139, 250, 0.42);
        animation: flenSpin 12s linear infinite;
      }

      .flen-orbit::after {
        inset: 46px;
        border-style: solid;
        border-color: rgba(96, 165, 250, 0.32);
        animation-duration: 8s;
        animation-direction: reverse;
      }

      .flen-core {
        position: absolute;
        inset: 68px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background:
          radial-gradient(circle, rgba(255,255,255,0.92), rgba(34, 211, 238, 0.74) 35%, rgba(14, 165, 233, 0.08) 68%);
        box-shadow: 0 0 34px rgba(34, 211, 238, 0.55);
        color: #07111f;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.1em;
      }

      .flen-sat {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--flen-cyan);
        box-shadow: 0 0 18px rgba(34, 211, 238, 0.85);
      }

      .flen-sat.one {
        top: 14px;
        left: 50%;
      }

      .flen-sat.two {
        bottom: 28px;
        right: 26px;
        background: var(--flen-purple);
        box-shadow: 0 0 18px rgba(167, 139, 250, 0.85);
      }

      .flen-sat.three {
        bottom: 52px;
        left: 20px;
        background: var(--flen-green);
        box-shadow: 0 0 18px rgba(52, 211, 153, 0.85);
      }

      .flen-orbit-label {
        position: absolute;
        bottom: 24px;
        left: 24px;
        right: 24px;
        color: var(--flen-muted);
        font-size: 12px;
        line-height: 1.5;
        text-align: center;
      }

      .flen-metrics-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 22px;
      }

      .flen-metric-card {
        min-height: 120px;
        padding: 18px;
        border-radius: var(--flen-radius-lg);
      }

      .flen-metric-label {
        margin: 0 0 14px;
        color: var(--flen-muted);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .flen-metric-value {
        display: block;
        color: var(--flen-text);
        font-size: clamp(24px, 3vw, 36px);
        font-weight: 950;
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .flen-metric-note {
        display: block;
        margin-top: 10px;
        color: #b6c4d4;
        font-size: 12px;
      }

      .flen-meter {
        height: 7px;
        margin-top: 16px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.16);
      }

      .flen-meter-fill {
        width: 8%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--flen-cyan), var(--flen-purple));
        transition: width 280ms ease;
      }

      .flen-workspace {
        display: grid;
        grid-template-columns: minmax(360px, 0.9fr) minmax(420px, 1.1fr);
        gap: 22px;
        align-items: start;
      }

      .flen-panel {
        border-radius: var(--flen-radius-xl);
        padding: 22px;
      }

      .flen-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 18px;
      }

      .flen-panel-title {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.02em;
      }

      .flen-panel-kicker {
        margin: 6px 0 0;
        color: var(--flen-muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .flen-form {
        display: grid;
        gap: 16px;
      }

      .flen-form label {
        display: grid;
        gap: 8px;
        color: #cfe9ff;
        font-size: 13px;
        font-weight: 800;
      }

      .flen-form textarea,
      .flen-form input,
      .flen-form select,
      .flen-field {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(125, 211, 252, 0.22);
        border-radius: 18px;
        outline: none;
        color: var(--flen-text);
        background:
          linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(2, 6, 23, 0.82));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.045),
          0 0 0 0 rgba(34, 211, 238, 0);
        padding: 14px 15px;
        font: inherit;
        transition:
          border-color 180ms ease,
          box-shadow 180ms ease,
          transform 180ms ease;
      }

      .flen-form textarea {
        min-height: 240px;
        resize: vertical;
        line-height: 1.55;
      }

      .flen-form textarea:focus,
      .flen-form input:focus,
      .flen-form select:focus,
      .flen-field:focus {
        border-color: var(--flen-border-hot);
        box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.10);
        transform: translateY(-1px);
      }

      .flen-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-top: 4px;
      }

      .flen-primary,
      .flen-button {
        position: relative;
        min-height: 46px;
        border: 0;
        border-radius: 16px;
        padding: 0 18px;
        cursor: pointer;
        font: inherit;
        font-weight: 950;
        letter-spacing: -0.01em;
        transition:
          transform 180ms ease,
          filter 180ms ease,
          opacity 180ms ease,
          border-color 180ms ease;
      }

      .flen-primary {
        color: #03111c;
        background: linear-gradient(135deg, var(--flen-cyan), #93c5fd 48%, var(--flen-purple));
        box-shadow:
          0 18px 44px rgba(34, 211, 238, 0.20),
          inset 0 1px 0 rgba(255,255,255,0.42);
      }

      .flen-button {
        color: #dff7ff;
        background: rgba(15, 23, 42, 0.74);
        border: 1px solid rgba(125, 211, 252, 0.22);
      }

      .flen-danger {
        color: #ffe4e9;
        border-color: rgba(251, 113, 133, 0.36);
        background: rgba(127, 29, 29, 0.22);
      }

      .flen-primary:hover,
      .flen-button:hover {
        transform: translateY(-2px);
        filter: brightness(1.07);
      }

      .flen-primary:disabled,
      .flen-button:disabled {
        cursor: not-allowed;
        opacity: 0.52;
        transform: none;
        filter: none;
      }

      .flen-status-row {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }

      .flen-status {
        min-height: 22px;
        color: #b8f3ff;
        font-size: 13px;
        font-weight: 800;
      }

      .flen-status[data-active="true"]::after {
        content: "";
        display: inline-block;
        width: 5px;
        height: 5px;
        margin-left: 8px;
        border-radius: 50%;
        background: var(--flen-cyan);
        animation: flenStatusBlink 900ms ease-in-out infinite;
      }

      .flen-progress-track {
        position: relative;
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.14);
      }

      .flen-progress-bar {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--flen-green), var(--flen-cyan), var(--flen-purple));
        transition: width 420ms ease;
      }

      .flen-progress-track[data-loading="true"] .flen-progress-bar {
        animation: flenProgressSweep 1.6s ease-in-out infinite;
      }

      .flen-error {
        padding: 12px 14px;
        border: 1px solid rgba(251, 113, 133, 0.34);
        border-radius: 16px;
        color: #ffe4e9;
        background: rgba(127, 29, 29, 0.28);
        font-size: 13px;
        line-height: 1.5;
      }

      .flen-result-shell {
        display: grid;
        gap: 16px;
      }

      .flen-output-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }

      .flen-result-container {
        position: relative;
        border: 1px solid rgba(125, 211, 252, 0.18);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(2, 6, 23, 0.72), rgba(15, 23, 42, 0.72));
        overflow: hidden;
      }

      .flen-result-container::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%),
          repeating-linear-gradient(
            0deg,
            rgba(255,255,255,0.018),
            rgba(255,255,255,0.018) 1px,
            transparent 1px,
            transparent 5px
          );
      }

      .flen-output {
        position: relative;
        z-index: 1;
        min-height: 330px;
        max-height: 670px;
        overflow: auto;
        margin: 0;
        padding: 20px;
        color: #eaf8ff;
        white-space: pre-wrap;
        line-height: 1.65;
        font-size: 14px;
      }

      .flen-empty-state {
        min-height: 330px;
        display: grid;
        place-items: center;
        padding: 28px;
        color: var(--flen-muted);
        text-align: center;
      }

      .flen-empty-state strong {
        display: block;
        margin-bottom: 8px;
        color: #eaf8ff;
        font-size: 18px;
      }

      .flen-history {
        margin-top: 16px;
        border-top: 1px solid rgba(125, 211, 252, 0.12);
        padding-top: 16px;
      }

      .flen-history-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0 0 10px;
        color: #dbeeff;
        font-size: 13px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .flen-history-list {
        display: grid;
        gap: 9px;
      }

      .flen-history-item {
        width: 100%;
        border: 1px solid rgba(125, 211, 252, 0.16);
        border-radius: 16px;
        padding: 12px;
        color: #dcecff;
        background: rgba(15, 23, 42, 0.48);
        text-align: left;
        cursor: pointer;
        transition:
          transform 160ms ease,
          border-color 160ms ease,
          background 160ms ease;
      }

      .flen-history-item:hover {
        transform: translateY(-1px);
        border-color: rgba(34, 211, 238, 0.42);
        background: rgba(15, 23, 42, 0.72);
      }

      .flen-history-meta {
        display: block;
        margin-bottom: 4px;
        color: #8fb2c8;
        font-size: 11px;
        font-weight: 800;
      }

      .flen-history-snippet {
        display: block;
        color: #eaf8ff;
        font-size: 13px;
        line-height: 1.45;
      }

      .flen-toast {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 20;
        max-width: min(420px, calc(100vw - 44px));
        padding: 14px 16px;
        border: 1px solid rgba(34, 211, 238, 0.32);
        border-radius: 18px;
        color: #eaf8ff;
        background: rgba(8, 13, 26, 0.92);
        box-shadow: var(--flen-shadow);
        backdrop-filter: blur(14px);
        transform: translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity 180ms ease,
          transform 180ms ease;
      }

      .flen-toast[data-visible="true"] {
        transform: translateY(0);
        opacity: 1;
      }

      .opacity-70 {
        opacity: 0.7;
      }

      .cursor-wait {
        cursor: wait;
      }

      @keyframes flenGridDrift {
        from {
          background-position: 0 0;
        }
        to {
          background-position: 44px 44px;
        }
      }

      @keyframes flenAuroraSpin {
        from {
          transform: rotate(0deg) scale(1.1);
        }
        to {
          transform: rotate(360deg) scale(1.1);
        }
      }

      @keyframes flenPanelSweep {
        0%, 56% {
          transform: translateX(-120%);
        }
        76%, 100% {
          transform: translateX(120%);
        }
      }

      @keyframes flenPulseDot {
        0% {
          box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.62);
        }
        70% {
          box-shadow: 0 0 0 12px rgba(52, 211, 153, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
        }
      }

      @keyframes flenOrbitFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-8px);
        }
      }

      @keyframes flenSpin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes flenStatusBlink {
        0%, 100% {
          opacity: 0.25;
        }
        50% {
          opacity: 1;
        }
      }

      @keyframes flenProgressSweep {
        0% {
          width: 12%;
          transform: translateX(-40%);
        }
        50% {
          width: 74%;
          transform: translateX(28%);
        }
        100% {
          width: 16%;
          transform: translateX(650%);
        }
      }

      @media (max-width: 980px) {
        .flen-hero,
        .flen-workspace {
          grid-template-columns: 1fr;
        }

        .flen-metrics-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 620px) {
        .flen-shell {
          width: min(100% - 20px, 1440px);
          padding-top: 18px;
        }

        .flen-hero-card,
        .flen-panel {
          padding: 18px;
          border-radius: 22px;
        }

        .flen-metrics-grid {
          grid-template-columns: 1fr;
        }

        .flen-panel-header {
          display: grid;
        }

        .flen-output-tools {
          justify-content: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.001ms !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getWordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function getReadabilityMode(wordCount) {
    if (wordCount === 0) {
      return 'Idle';
    }

    if (wordCount < 80) {
      return 'Quick scan';
    }

    if (wordCount < 350) {
      return 'Standard';
    }

    if (wordCount < 900) {
      return 'Deep review';
    }

    return 'Long-form';
  }

  function truncateText(text, maxLength) {
    if (!text) {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1).trim()}…`;
  }

  function getStoredHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function storeHistory(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
    } catch {
      // Storage is optional. The dashboard still works without it.
    }
  }

  function addHistoryItem(item) {
    const existing = getStoredHistory();
    const next = [item, ...existing].slice(0, MAX_HISTORY_ITEMS);

    storeHistory(next);
    return next;
  }

  function formatTimestamp(isoString) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(isoString));
    } catch {
      return 'Recent';
    }
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function animateOutput(outputElement, text) {
    if (!outputElement) {
      return;
    }

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    outputElement.dataset.fullText = text;

    if (prefersReducedMotion || text.length > 7000) {
      outputElement.textContent = text;
      return;
    }

    outputElement.textContent = '';

    let index = 0;
    const chunkSize = Math.max(3, Math.ceil(text.length / 180));

    function tick() {
      index += chunkSize;
      outputElement.textContent = text.slice(0, index);

      if (index < text.length) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function createMetricCard(label, value, note) {
    const valueElement = createElement('strong', {
      className: 'flen-metric-value',
      text: value,
      attrs: { 'data-value': '' }
    });

    const noteElement = createElement('span', {
      className: 'flen-metric-note',
      text: note,
      attrs: { 'data-note': '' }
    });

    const meterFill = createElement('div', {
      className: 'flen-meter-fill',
      attrs: { 'data-meter-fill': '' }
    });

    const card = createElement('section', { className: 'flen-metric-card' }, [
      createElement('p', { className: 'flen-metric-label', text: label }),
      valueElement,
      noteElement,
      createElement('div', { className: 'flen-meter' }, meterFill)
    ]);

    return {
      card,
      valueElement,
      noteElement,
      meterFill
    };
  }

  function createProgressController(statusElement, progressTrack, progressBar) {
    let stepIndex = 0;
    let timer = null;

    function start() {
      stop();

      stepIndex = 0;

      if (progressTrack) {
        progressTrack.dataset.loading = 'true';
      }

      if (progressBar) {
        progressBar.style.width = '18%';
      }

      setStatus(statusElement, ANALYSIS_STEPS[stepIndex]);

      timer = window.setInterval(() => {
        stepIndex = Math.min(stepIndex + 1, ANALYSIS_STEPS.length - 1);
        setStatus(statusElement, ANALYSIS_STEPS[stepIndex]);

        if (progressBar) {
          const width = Math.min(92, 18 + stepIndex * 14);
          progressBar.style.width = `${width}%`;
        }
      }, 1200);
    }

    function finish() {
      if (progressTrack) {
        progressTrack.dataset.loading = 'false';
      }

      if (progressBar) {
        progressBar.style.width = '100%';

        window.setTimeout(() => {
          progressBar.style.width = '0%';
        }, 500);
      }

      stop();
    }

    function stop() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }

      if (progressTrack) {
        progressTrack.dataset.loading = 'false';
      }
    }

    return {
      start,
      finish,
      stop
    };
  }

  function initDashboard({
    form,
    contentInput,
    platformInput,
    goalsInput,
    submitButton,
    statusElement,
    errorElement,
    resultContainer,
    resultOutput
  }) {
    injectDashboardStyles();

    if (document.body.dataset.flenDashboardReady === 'true') {
      return null;
    }

    document.body.dataset.flenDashboardReady = 'true';
    document.body.classList.add('flen-dashboard-enhanced');

    const parent = form.parentNode;

    if (!parent) {
      return null;
    }

    const characterMetric = createMetricCard('Characters', '0', 'Content size');
    const wordMetric = createMetricCard('Words', '0', 'Ready to analyze');
    const platformMetric = createMetricCard('Platform', 'General', 'Optional context');
    const goalMetric = createMetricCard('Mode', 'Idle', 'Paste content to begin');

    const progressBar = createElement('div', { className: 'flen-progress-bar' });
    const progressTrack = createElement('div', { className: 'flen-progress-track' }, progressBar);

    const toast = createElement('div', {
      className: 'flen-toast',
      attrs: {
        role: 'status',
        'aria-live': 'polite',
        'data-visible': 'false'
      }
    });

    const copyButton = createElement('button', {
      className: 'flen-button',
      text: 'Copy Result',
      attrs: { type: 'button', disabled: true }
    });

    const downloadButton = createElement('button', {
      className: 'flen-button',
      text: 'Download .txt',
      attrs: { type: 'button', disabled: true }
    });

    const clearButton = createElement('button', {
      className: 'flen-button',
      text: 'Clear',
      attrs: { type: 'button', disabled: true }
    });

    const cancelButton = createElement('button', {
      className: 'flen-button flen-danger hidden',
      text: 'Cancel Analysis',
      attrs: { type: 'button', disabled: true }
    });

    const historyList = createElement('div', { className: 'flen-history-list' });

    const orbit = createElement('div', { className: 'flen-orbit' }, [
      createElement('span', { className: 'flen-core', text: 'AI' }),
      createElement('span', { className: 'flen-sat one' }),
      createElement('span', { className: 'flen-sat two' }),
      createElement('span', { className: 'flen-sat three' })
    ]);

    const hero = createElement('section', { className: 'flen-hero' }, [
      createElement('div', { className: 'flen-hero-card' }, [
        createElement('div', { className: 'flen-eyebrow' }, [
          createElement('span', { className: 'flen-pulse-dot' }),
          'MR.FLEN Content Intelligence'
        ]),
        createElement('h1', { className: 'flen-title' }, [
          'Future-ready ',
          createElement('span', { text: 'content analysis dashboard' })
        ]),
        createElement('p', {
          className: 'flen-subtitle',
          text: 'Paste your content, define the platform and goals, then run a structured AI review with live dashboard metrics, saved snapshots, copy tools, and a polished interactive result panel.'
        }),
        createElement('div', { className: 'flen-command-strip' }, [
          createElement('span', { className: 'flen-chip', text: 'Secure session check' }),
          createElement('span', { className: 'flen-chip', text: 'Live content metrics' }),
          createElement('span', { className: 'flen-chip', text: 'Result memory' }),
          createElement('span', { className: 'flen-chip', text: 'Copy + download tools' })
        ])
      ]),
      createElement('aside', {
        className: 'flen-orbit-card',
        attrs: { 'aria-label': 'Dashboard visual status' }
      }, [
        orbit,
        createElement('p', {
          className: 'flen-orbit-label',
          text: 'Analysis engine standing by. Add your content and launch the scan.'
        })
      ])
    ]);

    const metrics = createElement('section', { className: 'flen-metrics-grid' }, [
      characterMetric.card,
      wordMetric.card,
      platformMetric.card,
      goalMetric.card
    ]);

    const inputPanel = createElement('section', { className: 'flen-panel' }, [
      createElement('div', { className: 'flen-panel-header' }, [
        createElement('div', {}, [
          createElement('h2', { className: 'flen-panel-title', text: 'Input Console' }),
          createElement('p', {
            className: 'flen-panel-kicker',
            text: 'Drop in the raw content. Platform and goals are optional, but they help sharpen the feedback.'
          })
        ])
      ])
    ]);

    const resultPanel = createElement('section', { className: 'flen-panel flen-result-shell' }, [
      createElement('div', { className: 'flen-panel-header' }, [
        createElement('div', {}, [
          createElement('h2', { className: 'flen-panel-title', text: 'Analysis Output' }),
          createElement('p', {
            className: 'flen-panel-kicker',
            text: 'Your AI feedback appears here with quick actions and recent result history.'
          })
        ]),
        createElement('div', { className: 'flen-output-tools' }, [
          copyButton,
          downloadButton,
          clearButton
        ])
      ])
    ]);

    const workspace = createElement('section', { className: 'flen-workspace' }, [
      inputPanel,
      resultPanel
    ]);

    const shell = createElement('main', {
      className: 'flen-shell',
      attrs: { 'aria-label': 'MR.FLEN content analysis dashboard' }
    }, [
      hero,
      metrics,
      workspace,
      toast
    ]);

    parent.insertBefore(shell, form);

    form.classList.add('flen-form');

    Array.from(form.elements || []).forEach((field) => {
      if (
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      ) {
        field.classList.add('flen-field');
      }
    });

    submitButton.classList.add('flen-primary');

    const nativeButtonRow = createElement('div', { className: 'flen-actions' });

    submitButton.parentNode?.insertBefore(nativeButtonRow, submitButton);
    nativeButtonRow.appendChild(submitButton);
    nativeButtonRow.appendChild(cancelButton);

    if (statusElement) {
      statusElement.classList.add('flen-status');
    }

    if (errorElement) {
      errorElement.classList.add('flen-error');
    }

    const statusRow = createElement('div', { className: 'flen-status-row' }, [
      statusElement || createElement('div', { className: 'flen-status' }),
      progressTrack
    ]);

    form.appendChild(statusRow);
    inputPanel.appendChild(form);

    if (resultContainer) {
      resultContainer.classList.add('flen-result-container');
      resultPanel.appendChild(resultContainer);
    } else {
      const emptyState = createElement('div', { className: 'flen-result-container' }, [
        createElement('div', { className: 'flen-empty-state' }, [
          createElement('div', {}, [
            createElement('strong', { text: 'No result container found' }),
            createElement('span', {
              text: 'Add an element with id="analysis-result" and id="analysis-output" to display feedback here.'
            })
          ])
        ])
      ]);

      resultPanel.appendChild(emptyState);
    }

    if (resultOutput) {
      resultOutput.classList.add('flen-output');
    }

    const historyPanel = createElement('section', { className: 'flen-history' }, [
      createElement('h3', { className: 'flen-history-title' }, [
        createElement('span', { text: 'Recent analysis' }),
        createElement('span', { text: 'Local only' })
      ]),
      historyList
    ]);

    resultPanel.appendChild(historyPanel);

    const progress = createProgressController(statusElement, progressTrack, progressBar);

    let latestResult = resultOutput?.textContent || '';
    let activeAbortController = null;
    let toastTimer = null;

    function showToast(message) {
      toast.textContent = message;
      toast.dataset.visible = 'true';

      if (toastTimer) {
        window.clearTimeout(toastTimer);
      }

      toastTimer = window.setTimeout(() => {
        toast.dataset.visible = 'false';
      }, 2200);
    }

    function updateToolState() {
      const hasResult = Boolean(latestResult && latestResult.trim());

      copyButton.disabled = !hasResult;
      downloadButton.disabled = !hasResult;
      clearButton.disabled = !hasResult;
    }

    function updateMetrics() {
      const content = contentInput.value || '';
      const platform = platformInput?.value?.trim() || 'General';
      const goals = goalsInput?.value?.trim() || '';
      const charCount = content.length;
      const wordCount = getWordCount(content);
      const readiness = Math.min(100, Math.round((charCount / 1200) * 100));
      const goalStrength = Math.min(100, Math.round(((goals.length || 0) / 180) * 100));

      characterMetric.valueElement.textContent = charCount.toLocaleString('en-GB');
      characterMetric.noteElement.textContent = charCount ? 'Content loaded' : 'Waiting for input';
      characterMetric.meterFill.style.width = `${Math.max(8, readiness)}%`;

      wordMetric.valueElement.textContent = wordCount.toLocaleString('en-GB');
      wordMetric.noteElement.textContent = getReadabilityMode(wordCount);
      wordMetric.meterFill.style.width = `${Math.max(8, Math.min(100, wordCount / 8))}%`;

      platformMetric.valueElement.textContent = truncateText(platform, 14);
      platformMetric.noteElement.textContent = platformInput?.value?.trim() ? 'Platform locked' : 'Optional context';
      platformMetric.meterFill.style.width = platformInput?.value?.trim() ? '100%' : '20%';

      goalMetric.valueElement.textContent = goals ? 'Focused' : getReadabilityMode(wordCount);
      goalMetric.noteElement.textContent = goals ? truncateText(goals, 34) : 'Add goals for sharper feedback';
      goalMetric.meterFill.style.width = `${goals ? Math.max(24, goalStrength) : Math.max(8, readiness)}%`;
    }

    function renderHistory() {
      const history = getStoredHistory();

      historyList.innerHTML = '';

      if (!history.length) {
        historyList.appendChild(
          createElement('div', { className: 'flen-history-item' }, [
            createElement('span', {
              className: 'flen-history-meta',
              text: 'No saved results yet'
            }),
            createElement('span', {
              className: 'flen-history-snippet',
              text: 'Run your first analysis and it will appear here.'
            })
          ])
        );
        return;
      }

      history.forEach((item) => {
        const button = createElement('button', {
          className: 'flen-history-item',
          attrs: { type: 'button' },
          on: {
            click: () => {
              latestResult = item.analysis || '';

              if (resultOutput) {
                resultOutput.textContent = latestResult;
                resultOutput.dataset.fullText = latestResult;
              }

              if (resultContainer) {
                resultContainer.classList.remove('hidden');
              }

              updateToolState();
              showToast('Previous analysis restored.');
            }
          }
        }, [
          createElement('span', {
            className: 'flen-history-meta',
            text: `${formatTimestamp(item.createdAt)} · ${item.platform || 'General'}`
          }),
          createElement('span', {
            className: 'flen-history-snippet',
            text: truncateText(item.content || 'Saved analysis', 92)
          })
        ]);

        historyList.appendChild(button);
      });
    }

    function showAnalysis(analysis, meta = {}) {
      latestResult = analysis || 'No feedback generated.';

      if (resultOutput && resultContainer) {
        resultContainer.classList.remove('hidden');
        animateOutput(resultOutput, latestResult);
      }

      addHistoryItem({
        createdAt: new Date().toISOString(),
        content: truncateText(meta.content || '', 180),
        platform: meta.platform || '',
        goals: meta.goals || '',
        analysis: latestResult
      });

      updateToolState();
      renderHistory();
      showToast('Analysis complete.');
    }

    function setAbortController(controller) {
      activeAbortController = controller || null;
      cancelButton.disabled = !activeAbortController;
      cancelButton.classList.toggle('hidden', !activeAbortController);
    }

    copyButton.addEventListener('click', async () => {
      try {
        await copyText(latestResult);
        showToast('Analysis copied to clipboard.');
      } catch {
        showToast('Copy failed. Select the text manually.');
      }
    });

    downloadButton.addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`mr-flen-content-analysis-${stamp}.txt`, latestResult);
      showToast('Download created.');
    });

    clearButton.addEventListener('click', () => {
      latestResult = '';

      if (resultOutput) {
        resultOutput.textContent = '';
        resultOutput.dataset.fullText = '';
      }

      if (resultContainer) {
        resultContainer.classList.add('hidden');
      }

      updateToolState();
      showToast('Output cleared.');
    });

    cancelButton.addEventListener('click', () => {
      if (activeAbortController) {
        activeAbortController.abort();
        showToast('Analysis cancelled.');
      }
    });

    contentInput.addEventListener('input', updateMetrics);
    platformInput?.addEventListener('input', updateMetrics);
    goalsInput?.addEventListener('input', updateMetrics);

    document.addEventListener('keydown', (event) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (modifierPressed && event.key === 'Enter' && !submitButton.disabled) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    updateMetrics();
    updateToolState();
    renderHistory();

    return {
      progress,
      showAnalysis,
      updateMetrics,
      setAbortController,
      showToast
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const contentInput = document.getElementById('analysis-content');
    const platformInput = document.getElementById('analysis-platform');
    const goalsInput = document.getElementById('analysis-goals');
    const submitButton = document.getElementById('analysis-submit');
    const statusElement = document.getElementById('analysis-status');
    const errorElement = document.getElementById('analysis-error');
    const resultContainer = document.getElementById('analysis-result');
    const resultOutput = document.getElementById('analysis-output');

    fetch('/api/auth/status', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.authenticated) {
          window.location.replace('login.html?error=session');
        }
      })
      .catch(() => {
        /*
          If the status check fails we let the form continue.
          The API will still enforce auth.
        */
      });

    if (!form || !contentInput || !submitButton) {
      return;
    }

    const dashboard = initDashboard({
      form,
      contentInput,
      platformInput,
      goalsInput,
      submitButton,
      statusElement,
      errorElement,
      resultContainer,
      resultOutput
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      setError(errorElement, '');
      setStatus(statusElement, '');

      const content = contentInput.value.trim();
      const platform = platformInput?.value.trim() || '';
      const goals = goalsInput?.value.trim() || '';

      if (!content) {
        setError(errorElement, 'Please paste the content you want to analyze.');
        return;
      }

      const abortController = new AbortController();

      submitButton.disabled = true;
      submitButton.classList.add('opacity-70', 'cursor-wait');

      dashboard?.setAbortController(abortController);
      dashboard?.progress.start();

      setStatus(statusElement, 'Analyzing your content...');

      try {
        const response = await fetch('/api/content/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          signal: abortController.signal,
          body: JSON.stringify({
            content,
            platform: platform || undefined,
            goals: goals || undefined
          })
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message = errorBody?.error || `Request failed with status ${response.status}.`;

          setError(errorElement, message);
          dashboard?.showToast?.('Analysis failed.');
          return;
        }

        const data = await response.json();

        if (!data?.ok) {
          setError(errorElement, data?.error || 'Analysis failed.');
          dashboard?.showToast?.('Analysis failed.');
          return;
        }

        const analysis = data.analysis || 'No feedback generated.';

        if (dashboard) {
          dashboard.showAnalysis(analysis, {
            content,
            platform,
            goals
          });
        } else if (resultOutput && resultContainer) {
          resultOutput.textContent = analysis;
          resultContainer.classList.remove('hidden');
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          setError(errorElement, 'Analysis cancelled.');
          return;
        }

        setError(errorElement, 'Unexpected error while analyzing content.');
        console.error('Error during content analysis', err);
      } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-70', 'cursor-wait');

        dashboard?.setAbortController(null);
        dashboard?.progress.finish();

        setStatus(statusElement, '');
        dashboard?.updateMetrics();
      }
    });
  });
})();
```
