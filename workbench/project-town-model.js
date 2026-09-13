(() => {
  'use strict';

  const ACTIVITY = Object.freeze({
    working: Object.freeze({ key: 'working', label: '作業中' }),
    researching: Object.freeze({ key: 'researching', label: '調査中' }),
    review: Object.freeze({ key: 'review', label: '見てもらい待ち' }),
    review_wait: Object.freeze({ key: 'review', label: '見てもらい待ち' }),
    paused: Object.freeze({ key: 'paused', label: '休止' }),
    external_wait: Object.freeze({ key: 'external_wait', label: '外部待ち' })
  });

  const escapeHtml = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );

  function decodeBase64Utf8(value) {
    const raw = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
  }

  function scalar(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    return text;
  }

  function parseFrontmatter(markdown) {
    const lines = String(markdown || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0] !== '---') return {};

    const meta = {};
    let arrayKey = '';

    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === '---') break;

      const item = /^\s+-\s+(.*)$/.exec(lines[index]);
      if (item && arrayKey) {
        if (!Array.isArray(meta[arrayKey])) meta[arrayKey] = [];
        meta[arrayKey].push(scalar(item[1]));
        continue;
      }

      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index]);
      if (!pair) continue;

      if (!pair[2].trim()) {
        meta[pair[1]] = '';
        arrayKey = pair[1];
      } else {
        meta[pair[1]] = scalar(pair[2]);
        arrayKey = '';
      }
    }

    return meta;
  }

  function isProjectCandidate(entry) {
    return entry?.type === 'file'
      && String(entry.name || '').endsWith('.md')
      && !/^(index|repositories)\.md$/i.test(entry.name)
      && !/^PROJECT_/i.test(entry.name)
      && !/-\d{4}-\d{2}-\d{2}\.md$/i.test(entry.name);
  }

  function todayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function ageDays(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 99;
    return Math.floor(
      (Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse(`${value}T00:00:00Z`)) / 86400000
    );
  }

  function projectText(project) {
    return `${project?.current || ''} ${project?.next || ''}`.toLowerCase();
  }

  function inferredActivity(project) {
    const text = projectText(project);

    if (/(見てもら|見てほしい|レビュー|review|確認してもら|確認お願いします|ユーザー確認|人間確認|成果物.*(確認|レビュー)|完成.*確認|提出済|できました|次どうしますか)/i.test(text)) {
      return ACTIVITY.review;
    }
    if (/(返信待ち|回答待ち|入荷待ち|公開待ち|反映待ち|外部要因|blocked|waiting)/i.test(text)) {
      return ACTIVITY.external_wait;
    }
    if (/(保留|休止|いったん止|後回し|次のタイミング|on hold)/i.test(text) || ageDays(project?.last_touched) >= 14) {
      return ACTIVITY.paused;
    }
    if (/(調べる|調査|探索|比較|検証|確認する|試す|試験|再試験|候補|検討|考える|判断|決める|方針|選ぶ|見直す|構想)/i.test(text)) {
      return ACTIVITY.researching;
    }
    return ACTIVITY.working;
  }

  function activity(project) {
    const explicit = String(project?.activity || '').trim().toLowerCase();
    return ACTIVITY[explicit] || inferredActivity(project);
  }

  function momentum(project) {
    const age = ageDays(project?.last_touched);
    const commitment = String(project?.commitment || '').toLowerCase();

    if (age === 0 && project?.desk === true) {
      return { key: 'surging', label: '急上昇', mark: '↑↑', speed: 1.42 };
    }
    if (age === 0) {
      return { key: 'rising', label: '上昇', mark: '↑', speed: 1.18 };
    }
    if (age <= 2 && (project?.desk === true || commitment === 'must' || commitment === 'chosen')) {
      return { key: 'rising', label: '上昇', mark: '↑', speed: 1.16 };
    }
    return { key: 'normal', label: '通常', mark: '', speed: 1 };
  }

  function motivation(project) {
    const age = ageDays(project?.last_touched);
    let score = age <= 1 ? 3 : age <= 7 ? 2 : 1;
    const commitment = String(project?.commitment || '').toLowerCase();

    if (commitment === 'must' || commitment === 'chosen') score = Math.max(score, 2);
    if (commitment === 'must') score = 3;
    return score;
  }

  function decisionText(project, currentActivity = activity(project)) {
    if (currentActivity.key === 'review') {
      return String(project?.decision || project?.next || '成果物を確認し、次へ進めるか・修正するかを指示してください。');
    }
    if (currentActivity.key === 'external_wait') {
      return `いまは外部要因待ちです。${project?.next ? ` 次の確認点: ${project.next}` : ''}`;
    }
    if (currentActivity.key === 'paused') {
      return String(project?.next || '再開するか、そのまま休止するかを判断できます。');
    }
    if (currentActivity.key === 'researching') {
      return '現在はAI側の調査ターンです。急いで判断する必要はありません。';
    }
    return '現在はAI側の作業ターンです。急いで判断する必要はありません。';
  }

  function detailMessage(currentActivity) {
    if (currentActivity.key === 'working') {
      return 'AI側の作業ターンです。PCの前で作業しています。';
    }
    if (currentActivity.key === 'researching') {
      return 'AI側の調査ターンです。資料棚の近くで調査・検討中です。';
    }
    if (currentActivity.key === 'review') {
      return 'あなたのターンです。成果物と判断内容を確認して、次の指示を返せます。';
    }
    if (currentActivity.key === 'external_wait') {
      return '外部要因を待っています。今すぐあなたが判断する必要はありません。';
    }
    return 'いまは休止しています。再開するときに起こせます。';
  }

  function handoffPrompt(project) {
    return `「${project.title}」Projectの続きを進めたい。\n\nまず gpts/${project.path} を確認して、Project正本を基準に現在地を把握してください。\n\n現在の記録:\nCurrent: ${project.current || '未記載'}\nNext: ${project.next || '未記載'}\nDecision: ${project.decision || '未記載'}\nactivity: ${project.activity || activity(project).key}\n\nこのProjectは私の判断・指示を待っている状態です。まず、今私が判断すべきことを1〜3点に絞って提示してください。私が返答したら、その内容に従って作業を進め、Project正本の current / next / decision / activity / last_touched / History を必要に応じて更新してください。`;
  }

  window.ProjectTownModel = Object.freeze({
    activities: ACTIVITY,
    escapeHtml,
    decodeBase64Utf8,
    parseFrontmatter,
    isProjectCandidate,
    ageDays,
    activity,
    momentum,
    motivation,
    decisionText,
    detailMessage,
    handoffPrompt
  });
})();
