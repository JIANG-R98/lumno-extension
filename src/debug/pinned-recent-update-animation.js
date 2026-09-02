(function(root) {
  'use strict';

  root.LumnoDisablePinnedRecentUpdateAutoAttach = true;

  const STAGES = ['breathing','card-enter','ready','old-out','new-in','saving','success','undone'];
  const SCENARIOS = Object.freeze({
    episode: {
      cardId: 'debug-course',
      previous: { title: '名侦探柯南 · 第 1127 集', url: 'https://www.bilibili.com/video/BV1demo/?p=7' },
      current: { title: '名侦探柯南 · 第 1128 集', url: 'https://www.bilibili.com/video/BV1demo/?p=8' }
    },
    cross: {
      cardId: 'debug-course',
      previous: { title: '产品设计方法 · 信息架构', url: 'https://www.bilibili.com/video/BV1old/' },
      current: { title: '交互设计案例 · 动效与状态反馈', url: 'https://www.bilibili.com/video/BV1new/' }
    },
    long: {
      cardId: 'debug-course',
      previous: { title: '课程导论', url: 'https://example.com/course/intro' },
      current: { title: '从结构化信息到可持续维护的复杂产品体验：完整案例拆解与实践说明', url: 'https://example.com/course/a-very-long-and-descriptive-chapter-address' }
    }
  });

  root.addEventListener('DOMContentLoaded', () => {
    const api = root.LumnoPinnedRecentUpdateFeedback;
    const canvas = document.querySelector('[data-animation-canvas]');
    if (!api || !canvas) return;
    const getScenario = () => SCENARIOS[document.querySelector('[data-control="scenario"]').value] || SCENARIOS.episode;
    const mockChrome = {
      i18n: root.chrome && root.chrome.i18n ? root.chrome.i18n : { getMessage: () => '' },
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          const sample = getScenario();
          root.setTimeout(() => callback({
            ok: true,
            reason: 'undone',
            previous: sample.current,
            current: sample.previous
          }), 180);
        }
      }
    };
    const controller = api.createFeedbackController({
      windowObj: root,
      documentObj: document,
      chromeApi: mockChrome,
      embedded: true,
      mountTarget: canvas,
      manualPlayback: true,
      visualVariant: 'homepage-card',
      confirmBeforeSwap: true,
      directUndo: true,
      fadeAfterUndo: true,
      undoFadeDelay: 560,
      previewTimings: { breathe: 180, enter: 140, commit: 220, exit: 160 }
    });
    const phaseOutput = document.querySelector('[data-output="phase"]');
    const stageButtons = Array.from(document.querySelectorAll('[data-stage]'));
    let replayToken = 0;

    function syncPhase() {
      const phase = controller.getPhase() || 'closed';
      phaseOutput.textContent = phase;
      stageButtons.forEach((button) => {
        button.dataset.active = button.dataset.stage === phase ? 'true' : 'false';
      });
      return phase;
    }

    function resetManual() {
      replayToken += 1;
      controller.showPreview(getScenario(), { manual: true });
      syncPhase();
    }

    function goToStage(targetPhase) {
      resetManual();
      const targetIndex = STAGES.indexOf(targetPhase);
      for (let index = 0; index < targetIndex; index += 1) controller.advancePreview();
      syncPhase();
      if (targetPhase === 'undone') root.setTimeout(syncPhase, 220);
    }

    function replay() {
      const token = ++replayToken;
      const sample = getScenario();
      const speed = Math.max(.1, Number(document.querySelector('[data-control="speed"]').value) || 1);
      controller.setPlaybackRate(speed);
      controller.showPreview(sample, { manual: true });
      syncPhase();
      const steps = [180, 140, 360, 100, 220];
      let elapsed = 0;
      steps.forEach((delay) => {
        elapsed += delay / speed;
        root.setTimeout(() => {
          if (token !== replayToken) return;
          controller.advancePreview();
          syncPhase();
        }, elapsed);
      });
      elapsed += 140 / speed;
      root.setTimeout(() => {
        if (token !== replayToken) return;
        controller.show({ action: api.ACTION, ok: true, reason: 'updated', ...sample });
        syncPhase();
      }, elapsed);
    }

    document.querySelector('[data-control="speed"]').addEventListener('change', (event) => {
      controller.setPlaybackRate(event.target.value);
      resetManual();
    });
    document.querySelector('[data-control="scenario"]').addEventListener('change', resetManual);
    document.querySelector('[data-action="reset"]').addEventListener('click', resetManual);
    document.querySelector('[data-action="advance"]').addEventListener('click', () => {
      replayToken += 1;
      controller.advancePreview();
      root.setTimeout(syncPhase, 220);
      syncPhase();
    });
    document.querySelector('[data-action="replay"]').addEventListener('click', replay);
    stageButtons.forEach((button) => button.addEventListener('click', () => goToStage(button.dataset.stage)));

    controller.setPlaybackRate(1);
    resetManual();
  });
})(globalThis);
