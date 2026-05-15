/**
 * お知らせ: ローカル既読 / ポップアップ済み + モーダル DOM 生成
 * 依存: firebaseDataManager.listAnnouncementsPublic()
 */
(function (global) {
  const ACK_KEY = 'shooting_announcements_ack_v1';
  const STYLE_ID = 'shooting-announcements-sa-styles';
  /** タイトルまたは本文に含まれる場合、Firestore の imageUrl に関わらずローカル画像を差し込む */
  const ONE_OFF_IMG_TITLE_MARKERS = ['新イベント近日公開', '限定特殊武器バリアを付与'];
  const ONE_OFF_ANNOUNCEMENT_ASSETS = {
    banner: 'assets/event/doragonevent.png',
    eventBoss: 'assets/event/doragonsukin.png'
  };

  function loadRawAck() {
    try {
      return JSON.parse(global.localStorage.getItem(ACK_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function saveRawAck(obj) {
    try {
      global.localStorage.setItem(ACK_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }

  function getAck() {
    const raw = loadRawAck();
    return {
      popupSeenIds: Array.isArray(raw.popupSeenIds) ? raw.popupSeenIds : [],
      readIds: Array.isArray(raw.readIds) ? raw.readIds : []
    };
  }

  function markPopupSeen(id) {
    if (!id) return;
    const raw = loadRawAck();
    const popupSeenIds = Array.isArray(raw.popupSeenIds) ? raw.popupSeenIds : [];
    const readIds = Array.isArray(raw.readIds) ? raw.readIds : [];
    if (!popupSeenIds.includes(id)) popupSeenIds.push(id);
    if (!readIds.includes(id)) readIds.push(id);
    saveRawAck({ ...raw, popupSeenIds, readIds });
  }

  function markRead(id) {
    if (!id) return;
    const raw = loadRawAck();
    const readIds = Array.isArray(raw.readIds) ? raw.readIds : [];
    if (!readIds.includes(id)) readIds.push(id);
    saveRawAck({ ...raw, readIds });
  }

  function unseenCount(announcements) {
    const read = new Set(getAck().readIds);
    return announcements.filter(a => a && a.id && !read.has(a.id)).length;
  }

  /** 並び順の先頭から、未読のお知らせを 1 件返す（起動時ポップアップ用） */
  function firstUnreadAnnouncement(announcements) {
    const read = new Set(getAck().readIds);
    for (let i = 0; i < announcements.length; i++) {
      const a = announcements[i];
      if (a && a.id && !read.has(a.id)) return a;
    }
    return null;
  }

  function injectStyles() {
    if (global.document.getElementById(STYLE_ID)) return;
    const el = global.document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
      .sa-an-overlay{position:fixed;inset:0;background:rgba(0,8,24,.88);backdrop-filter:blur(6px);
        z-index:6000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
      .sa-an-overlay.sa-open{display:flex;}
      .sa-an-card{background:linear-gradient(165deg,rgba(24,28,52,.97),rgba(10,12,28,.97));
        border:2px solid rgba(0,230,255,.38);border-radius:16px;max-width:520px;width:100%;max-height:86vh;
        overflow:hidden;display:flex;flex-direction:column;color:#eef;box-shadow:0 20px 60px rgba(0,0,0,.55);}
      .sa-an-head{padding:14px 44px 10px 18px;border-bottom:1px solid rgba(255,255,255,.1);position:relative;}
      .sa-an-head h3{margin:0;font-size:1.15rem;color:#5ff;}
      .sa-an-close{position:absolute;top:6px;right:10px;background:transparent;border:none;color:#fff;
        font-size:1.6rem;line-height:1;cursor:pointer;padding:6px 10px;border-radius:8px;}
      .sa-an-close:hover{background:rgba(255,255,255,.12);}
      .sa-an-body{padding:16px 18px;overflow-y:auto;flex:1;font-size:0.95rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
      .sa-an-foot{padding:12px 18px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}
      .sa-an-btn{background:linear-gradient(45deg,#2266cc,#4488ff);color:#fff;border:none;padding:10px 20px;border-radius:10px;
        font-weight:bold;cursor:pointer;font-size:0.95rem;}
      .sa-an-btn.secondary{background:rgba(255,255,255,.12);}
      .sa-an-list{list-style:none;margin:0;padding:0;}
      .sa-an-li{margin:0;padding:0;border-bottom:1px solid rgba(255,255,255,.08);}
      .sa-an-row{width:100%;text-align:left;background:rgba(255,255,255,.04);border:none;color:#fff;
        padding:12px 16px;cursor:pointer;display:flex;flex-direction:row;align-items:center;gap:10px;font-size:0.95rem;}
      .sa-an-row:hover{background:rgba(0,255,255,.1);}
      .sa-an-row.unread{border-left:3px solid #ff6b9d;}
      .sa-an-row.read{opacity:.85;}
      .sa-an-row-textcol{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;text-align:left;}
      .sa-an-row-title{font-weight:bold;color:#bff;}
      .sa-an-row-meta{font-size:0.75rem;color:#9ab;}
      .sa-an-empty{padding:20px;text-align:center;color:#9ab;}
      .sa-an-popup-media{margin:0 0 14px 0;}
      .sa-an-popup-media img{width:100%;max-height:min(38vh,260px);object-fit:cover;border-radius:12px;display:block;
        box-shadow:0 8px 28px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);}
      .sa-an-popup-boss-media{margin:14px 0 0 0;}
      .sa-an-popup-boss-media img{max-height:min(28vh,200px);object-fit:contain;background:rgba(0,0,0,.15);}
      .sa-an-image-fail{margin:0 0 12px 0;padding:12px;border-radius:10px;background:rgba(80,20,20,.45);
        border:1px solid rgba(255,120,120,.35);font-size:0.86rem;line-height:1.45;color:#fcc;text-align:center;}
      .sa-an-image-fail a{color:#9df;text-decoration:underline;}
      .sa-an-popup-text{white-space:pre-wrap;word-break:break-word;}
      .sa-an-row-thumb{width:56px;height:56px;object-fit:cover;border-radius:10px;flex-shrink:0;border:1px solid rgba(255,255,255,.12);}
      .sa-home-an-btn-wrap{position:relative;display:inline-block;flex-shrink:0;}
      .sa-home-an-btn-wrap .announce-nav-badge{
        display:none;position:absolute;top:-8px;right:-6px;min-width:20px;height:20px;padding:0 6px;
        align-items:center;justify-content:center;background:#c62828;color:#fff;font-size:11px;font-weight:bold;
        border-radius:10px;border:1px solid rgba(255,255,255,.35);box-shadow:0 2px 8px rgba(180,0,0,.55);line-height:1;pointer-events:none;}
      .sa-home-an-strip{
        display:flex;flex-direction:column;align-items:stretch;width:100%;max-width:min(720px,96vw);margin:0 auto;
        padding:0;border:none;border-radius:14px;overflow:hidden;cursor:pointer;text-align:left;
        border:1px solid rgba(0,230,255,.4);background:rgba(8,14,40,.82);
        box-shadow:0 10px 36px rgba(0,0,0,.5);}
      .sa-home-an-strip:hover{border-color:rgba(120,220,255,.65);box-shadow:0 12px 40px rgba(0,40,80,.55);}
      .sa-home-an-strip img{display:block;width:100%;height:auto;max-height:min(26vh,220px);object-fit:cover;}
      .sa-home-an-strip-cap{padding:8px 12px;font-size:clamp(0.75rem,2.2vw,0.88rem);color:#bdf;text-align:center;
        background:rgba(0,0,0,.4);border-top:1px solid rgba(255,255,255,.1);}
      /* ゲーム本体: #ui が z-index:100 のため 58 だと完全に下に隠れる。HUD より上・モーダルより下。 */
      .sa-game-an-fab{position:fixed;right:10px;top:48px;left:auto;z-index:120;padding:7px 12px;border-radius:999px;
        background:rgba(10,16,40,.92);border:1px solid rgba(0,230,255,.42);color:#bff;
        font-size:clamp(11px,2.6vw,14px);cursor:pointer;backdrop-filter:blur(5px);
        box-shadow:0 4px 16px rgba(0,0,0,.5);font-weight:600;line-height:1.2;pointer-events:auto;}
      .sa-game-an-fab:hover{background:rgba(22,36,72,.98);border-color:rgba(120,220,255,.55);}
    `;
    global.document.head.appendChild(el);
  }

  function ensureDom() {
    injectStyles();
    const d = global.document;
    if (d.getElementById('saAnPopupOverlay')) return;

    const closePopupSingle = () => {
      const o = d.getElementById('saAnPopupOverlay');
      if (!o) return;
      const fn = o._saFinalize;
      closeOverlay(o);
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { /* ignore */ }
      }
      o._saFinalize = null;
    };

    const mkOverlay = (id, onBackdrop) => {
      const o = d.createElement('div');
      o.className = 'sa-an-overlay';
      o.id = id;
      o.setAttribute('role', 'dialog');
      o.setAttribute('aria-modal', 'true');
      o.setAttribute('aria-hidden', 'true');
      o.addEventListener('click', (ev) => {
        if (ev.target !== o) return;
        if (typeof onBackdrop === 'function') onBackdrop();
        else closeOverlay(o);
      });
      return o;
    };

    const popup = mkOverlay('saAnPopupOverlay', closePopupSingle);
    popup.innerHTML = `
      <div class="sa-an-card" role="document">
        <div class="sa-an-head">
          <h3 id="saAnPopupTitle">お知らせ</h3>
          <button type="button" class="sa-an-close" id="saAnPopupClose" aria-label="閉じる">×</button>
        </div>
        <div class="sa-an-body" id="saAnPopupBody"></div>
        <div class="sa-an-foot">
          <button type="button" class="sa-an-btn" id="saAnPopupOk">閉じる</button>
        </div>
      </div>`;
    d.body.appendChild(popup);
    popup.querySelector('#saAnPopupClose').addEventListener('click', closePopupSingle);
    popup.querySelector('#saAnPopupOk').addEventListener('click', closePopupSingle);

    const listOv = mkOverlay('saAnListOverlay');
    listOv.innerHTML = `
      <div class="sa-an-card" style="max-width:560px" role="document">
        <div class="sa-an-head">
          <h3>📢 お知らせ一覧</h3>
          <button type="button" class="sa-an-close" id="saAnListClose" aria-label="閉じる">×</button>
        </div>
        <div class="sa-an-body" style="padding:0" id="saAnListScroll">
          <ul class="sa-an-list" id="saAnListUl"></ul>
        </div>
        <div class="sa-an-foot">
          <button type="button" class="sa-an-btn secondary" id="saAnListMarkAll">すべて既読</button>
          <button type="button" class="sa-an-btn" id="saAnListDone">閉じる</button>
        </div>
      </div>`;
    d.body.appendChild(listOv);
    listOv.querySelector('#saAnListClose').addEventListener('click', () => closeOverlay(listOv));
    listOv.querySelector('#saAnListDone').addEventListener('click', () => closeOverlay(listOv));
    listOv.querySelector('#saAnListMarkAll').addEventListener('click', () => {
      if (typeof listOv._saMarkAll === 'function') listOv._saMarkAll();
      if (typeof listOv._saAfterMarkAll === 'function') listOv._saAfterMarkAll();
    });
  }

  function openOverlay(el) {
    if (!el) return;
    el.classList.add('sa-open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeOverlay(el) {
    if (!el) return;
    el.classList.remove('sa-open');
    el.setAttribute('aria-hidden', 'true');
  }

  function formatMetaLine(ann) {
    const parts = [];
    if (ann.startsAt) parts.push(`掲載開始: ${ann.startsAt}`);
    if (ann.endsAt) parts.push(`掲載終了: ${ann.endsAt}`);
    return parts.join(' · ') || '運営からのお知らせ';
  }

  /** 表示用に imageUrl 文字列を正規化（不可視文字・引用符・改行混入を除去） */
  function getSanitizedAnnouncementImageUrl(raw) {
    let u = String(raw == null ? '' : raw).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (u.startsWith('`') && u.endsWith('`')) u = u.slice(1, -1).trim();
    if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
      u = u.slice(1, -1).trim();
    }
    u = u.replace(/\s+/g, '');
    return u;
  }

  /** お知らせオブジェクトから画像 URL を取得（正規化済み + 互換キー） */
  function getAnnouncementImageUrlForAnn(ann) {
    if (!ann) return '';
    const raw = ann.imageUrl ?? ann.imageURL ?? ann.bannerUrl ?? ann.banner_url ?? ann.image;
    return getSanitizedAnnouncementImageUrl(raw);
  }

  /** https または同一サイト相対パスの画像のみ表示（XSS 対策） */
  function isAllowedAnnouncementImageUrl(url) {
    const u = getSanitizedAnnouncementImageUrl(url);
    if (!u || u.startsWith('//')) return false;
    if (/^https:\/\//i.test(u)) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u)) return true;
    if (u.startsWith('/') && u.length > 1) return true;
    if (u.indexOf('..') === -1 && /^(assets|images)\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp|gif|svg)$/i.test(u)) {
      return true;
    }
    return false;
  }

  function isOneOffAnnouncementForLocalImages(ann) {
    if (!ann) return false;
    const hay = `${ann.title || ''}\n${ann.body || ''}`;
    return ONE_OFF_IMG_TITLE_MARKERS.some((m) => hay.indexOf(m) !== -1);
  }

  function applyOneOffAnnouncementImages(list) {
    if (!Array.isArray(list)) return list;
    return list.map((ann) => {
      if (!ann || !isOneOffAnnouncementForLocalImages(ann)) return ann;
      return {
        ...ann,
        imageUrl: ONE_OFF_ANNOUNCEMENT_ASSETS.banner,
        _oneOffEventBossImage: ONE_OFF_ANNOUNCEMENT_ASSETS.eventBoss
      };
    });
  }

  function showDetailModal(ann, opts) {
    ensureDom();
    const overlay = global.document.getElementById('saAnPopupOverlay');
    const titleEl = global.document.getElementById('saAnPopupTitle');
    const bodyEl = global.document.getElementById('saAnPopupBody');
    const markAsPopupSeen = opts && opts.markAsPopupSeen;
    titleEl.textContent = ann.title || 'お知らせ';
    bodyEl.innerHTML = '';
    const imgUrl = getAnnouncementImageUrlForAnn(ann);
    if (imgUrl && isAllowedAnnouncementImageUrl(imgUrl)) {
      const media = global.document.createElement('div');
      media.className = 'sa-an-popup-media';
      const img = global.document.createElement('img');
      img.src = imgUrl;
      img.alt = '';
      img.loading = 'eager';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ShootingAnnouncements] 画像の読み込みに失敗しました:', String(imgUrl).slice(0, 200));
        }
        try { img.remove(); } catch (e) { /* ignore */ }
        const fail = global.document.createElement('div');
        fail.className = 'sa-an-image-fail';
        const p = global.document.createElement('p');
        p.style.margin = '0 0 8px 0';
        p.appendChild(global.document.createTextNode('バナー画像をこの画面内では表示できませんでした。'));
        fail.appendChild(p);
        const a = global.document.createElement('a');
        a.href = imgUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '画像を別タブで開く';
        fail.appendChild(a);
        media.appendChild(fail);
      });
      media.appendChild(img);
      bodyEl.appendChild(media);
    }
    const textEl = global.document.createElement('div');
    textEl.className = 'sa-an-popup-text';
    textEl.textContent = ann.body || '';
    bodyEl.appendChild(textEl);

    // 本文下の2枚目: ワンオフ対象は常にローカル固定（一覧経由で apply 済みでなくても表示を揃える）
    const bossRaw = ann._oneOffEventBossImage
      || (isOneOffAnnouncementForLocalImages(ann) ? ONE_OFF_ANNOUNCEMENT_ASSETS.eventBoss : null);
    const bossUrl = bossRaw && getSanitizedAnnouncementImageUrl(bossRaw);
    if (bossUrl && isAllowedAnnouncementImageUrl(bossUrl)) {
      const mediaBoss = global.document.createElement('div');
      mediaBoss.className = 'sa-an-popup-media sa-an-popup-boss-media';
      const imgBoss = global.document.createElement('img');
      imgBoss.src = bossUrl;
      imgBoss.alt = '';
      imgBoss.loading = 'eager';
      imgBoss.decoding = 'async';
      imgBoss.addEventListener('error', () => {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ShootingAnnouncements] イベントボス画像の読み込みに失敗:', String(bossUrl).slice(0, 200));
        }
        try { imgBoss.remove(); } catch (e) { /* ignore */ }
        const fail = global.document.createElement('div');
        fail.className = 'sa-an-image-fail';
        const p = global.document.createElement('p');
        p.style.margin = '0 0 8px 0';
        p.appendChild(global.document.createTextNode('イベントボス画像をこの画面内では表示できませんでした。'));
        fail.appendChild(p);
        const a = global.document.createElement('a');
        a.href = bossUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '画像を別タブで開く';
        fail.appendChild(a);
        mediaBoss.appendChild(fail);
      });
      mediaBoss.appendChild(imgBoss);
      bodyEl.appendChild(mediaBoss);
    }

    overlay._saFinalize = () => {
      markRead(ann.id);
      if (markAsPopupSeen) markPopupSeen(ann.id);
      if (opts && typeof opts.onClosed === 'function') opts.onClosed();
    };

    openOverlay(overlay);
  }

  function fillList(announcements, onSelect) {
    ensureDom();
    const ul = global.document.getElementById('saAnListUl');
    const listOv = global.document.getElementById('saAnListOverlay');
    ul.innerHTML = '';
    if (!announcements.length) {
      const li = global.document.createElement('li');
      li.className = 'sa-an-empty';
      li.textContent = '表示中のお知らせはありません。';
      ul.appendChild(li);
    } else {
      const readSet = new Set(getAck().readIds);
      announcements.forEach((ann) => {
        const li = global.document.createElement('li');
        li.className = 'sa-an-li';
        const btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className = 'sa-an-row ' + (readSet.has(ann.id) ? 'read' : 'unread');
        const imgU = getAnnouncementImageUrlForAnn(ann);
        if (imgU && isAllowedAnnouncementImageUrl(imgU)) {
          const thumb = global.document.createElement('img');
          thumb.className = 'sa-an-row-thumb';
          thumb.src = imgU;
          thumb.alt = '';
          thumb.loading = 'lazy';
          thumb.addEventListener('error', () => {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[ShootingAnnouncements] サムネイル読み込み失敗:', String(imgU).slice(0, 160));
            }
            thumb.style.display = 'none';
          });
          btn.appendChild(thumb);
        }
        const col = global.document.createElement('div');
        col.className = 'sa-an-row-textcol';
        const t = global.document.createElement('div');
        t.className = 'sa-an-row-title';
        t.textContent = ann.title || '(無題)';
        const m = global.document.createElement('div');
        m.className = 'sa-an-row-meta';
        m.textContent = formatMetaLine(ann);
        col.appendChild(t);
        col.appendChild(m);
        btn.appendChild(col);
        btn.addEventListener('click', () => {
          if (typeof onSelect === 'function') onSelect(ann);
        });
        li.appendChild(btn);
        ul.appendChild(li);
      });
    }
    listOv._saMarkAll = () => {
      announcements.forEach(a => markRead(a.id));
      fillList(announcements, onSelect);
    };
  }

  function openListModal(announcements, opts) {
    ensureDom();
    const listOv = global.document.getElementById('saAnListOverlay');
    const onSelect = (ann) => {
      closeOverlay(listOv);
      showDetailModal(ann, { markAsPopupSeen: false, onClosed: () => {
        if (opts && typeof opts.onRefreshBadge === 'function') opts.onRefreshBadge();
        if (opts && typeof opts.afterDetailClose === 'function') opts.afterDetailClose();
      }});
    };
    fillList(announcements, onSelect);
    listOv._saAfterMarkAll = (opts && typeof opts.onRefreshBadge === 'function') ? opts.onRefreshBadge : null;
    openOverlay(listOv);
  }

  function updateBadgeEl(badgeEl, n) {
    if (!badgeEl) return;
    if (n > 0) {
      badgeEl.textContent = n > 99 ? '99+' : String(n);
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.textContent = '';
      badgeEl.style.display = 'none';
    }
  }

  async function fetchPublicList() {
    if (typeof global.firebaseDataManager === 'undefined' || !global.firebaseDataManager.listAnnouncementsPublic) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ShootingAnnouncements] firebaseDataManager が未初期化のためお知らせを取得できません');
      }
      return [];
    }
    try {
      const list = await global.firebaseDataManager.listAnnouncementsPublic();
      return applyOneOffAnnouncementImages(list);
    } catch (e) {
      const code = e && e.code;
      const msg = e && e.message;
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ShootingAnnouncements] Firestore お知らせ取得失敗:', code || '', msg || e);
      }
      return [];
    }
  }

  function tryAutoPopup(announcements, onAfter) {
    const ann = firstUnreadAnnouncement(announcements);
    if (!ann) {
      if (typeof onAfter === 'function') onAfter();
      return;
    }
    showDetailModal(ann, {
      markAsPopupSeen: true,
      onClosed: () => {
        if (typeof onAfter === 'function') onAfter();
      }
    });
  }

  /**
   * ホーム右上: ログインボタンと同型の「お知らせ」ボタン（押下で一覧ポップアップ）
   */
  function renderHomeAnnouncementButton(panelEl, announcements, ctx) {
    if (!panelEl) return;
    const d = global.document;
    injectStyles();
    panelEl.innerHTML = '';
    const wrap = d.createElement('span');
    wrap.className = 'sa-home-an-btn-wrap';
    const btn = d.createElement('button');
    btn.type = 'button';
    btn.className = 'mypage-button';
    btn.id = 'homeAnnouncementsBtn';
    btn.setAttribute('aria-label', 'お知らせ一覧');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.appendChild(d.createTextNode('📢 お知らせ'));
    const badge = d.createElement('span');
    badge.id = 'homeAnnouncementBadge';
    badge.className = 'announce-nav-badge';
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);
    updateBadgeEl(badge, unseenCount(announcements));
    btn.addEventListener('click', () => {
      if (ctx && typeof ctx.onOpenList === 'function') ctx.onOpenList();
    });
    wrap.appendChild(btn);
    panelEl.appendChild(wrap);
  }

  /** ホーム: 画像バナーは表示しない（お知らせボタン・モーダルのみ利用） */
  function renderHomeAnnouncementStrip(stripEl, announcements, onDetailClosed) {
    if (!stripEl) return;
    stripEl.innerHTML = '';
    stripEl.style.display = 'none';
    void announcements;
    void onDetailClosed;
  }

  /**
   * ホーム用: お知らせボタン + 未読があれば起動時ポップアップ
   * options.panelEl 必須（ホーム専用マウント）
   */
  function bootstrapIndex(options) {
    const panelEl = options && options.panelEl;
    const stripEl = options && options.stripEl;
    let cache = [];

    async function refreshHomeUi() {
      try {
        cache = await fetchPublicList();
      } catch (e) { /* keep cache */ }
      if (panelEl) renderHomeAnnouncementButton(panelEl, cache, homeCtx);
      if (stripEl) renderHomeAnnouncementStrip(stripEl, cache, refreshHomeUi);
    }

    const homeCtx = {
      onOpenList: async () => {
        try {
          cache = await fetchPublicList();
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[ShootingAnnouncements] 一覧用再取得:', e);
          }
        }
        openListModal(cache, {
          onRefreshBadge: () => {
            refreshHomeUi();
          }
        });
      }
    };

    async function refresh() {
      cache = await fetchPublicList();
      if (panelEl) renderHomeAnnouncementButton(panelEl, cache, homeCtx);
      if (stripEl) renderHomeAnnouncementStrip(stripEl, cache, refreshHomeUi);
      return cache;
    }

    refresh().then((list) => {
      setTimeout(() => {
        tryAutoPopup(list, () => {
          refreshHomeUi();
        });
      }, options && options.popupDelayMs != null ? options.popupDelayMs : 700);
    }).catch((e) => {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ShootingAnnouncements] bootstrapIndex 初期化エラー:', e);
      }
    });

    global.document.addEventListener('visibilitychange', () => {
      if (!global.document.hidden) {
        refresh().catch((e) => {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[ShootingAnnouncements] 再取得エラー:', e);
          }
        });
      }
    });
  }

  /**
   * マイページ: カード内に一覧を描画
   */
  function renderMypageCard(container, announcements) {
    if (!container) return;
    container.innerHTML = '';
    if (!announcements.length) {
      const p = global.document.createElement('p');
      p.style.cssText = 'color:#9ab;margin:0;font-size:0.9rem;';
      p.textContent = '現在、表示中のお知らせはありません。';
      container.appendChild(p);
      return;
    }
    const ul = global.document.createElement('ul');
    ul.className = 'sa-an-list';
    ul.style.maxHeight = '280px';
    ul.style.overflow = 'auto';
    const readSet = new Set(getAck().readIds);
    announcements.forEach((ann) => {
      const li = global.document.createElement('li');
      li.className = 'sa-an-li';
      const b = global.document.createElement('button');
      b.type = 'button';
      b.className = 'sa-an-row ' + (readSet.has(ann.id) ? 'read' : 'unread');
      b.style.borderRadius = '0';
      const imgU = getAnnouncementImageUrlForAnn(ann);
      if (imgU && isAllowedAnnouncementImageUrl(imgU)) {
        const thumb = global.document.createElement('img');
        thumb.className = 'sa-an-row-thumb';
        thumb.src = imgU;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.addEventListener('error', () => {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[ShootingAnnouncements] サムネイル読み込み失敗:', String(imgU).slice(0, 160));
          }
          thumb.style.display = 'none';
        });
        b.appendChild(thumb);
      }
      const col = global.document.createElement('div');
      col.className = 'sa-an-row-textcol';
      const t = global.document.createElement('div');
      t.className = 'sa-an-row-title';
      t.textContent = ann.title || '(無題)';
      const m = global.document.createElement('div');
      m.className = 'sa-an-row-meta';
      m.textContent = formatMetaLine(ann);
      col.appendChild(t);
      col.appendChild(m);
      b.appendChild(col);
      b.addEventListener('click', () => {
        showDetailModal(ann, { markAsPopupSeen: false, onClosed: () => {
          renderMypageCard(container, announcements);
          const badge = global.document.getElementById('mypageAnnouncementBadge');
          updateBadgeEl(badge, unseenCount(announcements));
        }});
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    container.appendChild(ul);
    const row = global.document.createElement('div');
    row.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
    const allBtn = global.document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'save-button';
    allBtn.style.cssText = 'padding:8px 14px;font-size:0.85rem;background:rgba(255,255,255,.15);';
    allBtn.textContent = 'すべて既読';
    allBtn.addEventListener('click', () => {
      announcements.forEach(a => markRead(a.id));
      renderMypageCard(container, announcements);
      const badge = global.document.getElementById('mypageAnnouncementBadge');
      updateBadgeEl(badge, unseenCount(announcements));
    });
    const openAll = global.document.createElement('button');
    openAll.type = 'button';
    openAll.className = 'save-button';
    openAll.style.cssText = 'padding:8px 14px;font-size:0.85rem;';
    openAll.textContent = '大きく表示';
    openAll.addEventListener('click', () => {
      openListModal(announcements, {
        onRefreshBadge: () => {
          renderMypageCard(container, announcements);
          const badge = global.document.getElementById('mypageAnnouncementBadge');
          updateBadgeEl(badge, unseenCount(announcements));
        }
      });
    });
    row.appendChild(allBtn);
    row.appendChild(openAll);
    container.appendChild(row);
  }

  async function bootstrapMypage(container) {
    const list = await fetchPublicList();
    renderMypageCard(container, list);
    const badge = global.document.getElementById('mypageAnnouncementBadge');
    updateBadgeEl(badge, unseenCount(list));
    setTimeout(() => tryAutoPopup(list, () => updateBadgeEl(badge, unseenCount(list))), 600);
  }

  function bootstrapGame() {
    let cache = [];
    injectStyles();

    function ensureGameAnnouncementFab() {
      const d = global.document;
      if (d.getElementById('gameAnnouncementFab')) return;
      ensureDom();
      const btn = d.createElement('button');
      btn.id = 'gameAnnouncementFab';
      btn.type = 'button';
      btn.className = 'sa-game-an-fab';
      btn.setAttribute('aria-label', 'お知らせ一覧');
      btn.appendChild(d.createTextNode('📢 お知らせ'));
      btn.addEventListener('click', async () => {
        try {
          cache = await fetchPublicList();
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[ShootingAnnouncements] 一覧用再取得失敗:', e);
          }
        }
        openListModal(cache, {});
      });
      d.body.appendChild(btn);
    }

    fetchPublicList()
      .then((list) => {
        cache = list;
        ensureGameAnnouncementFab();
        setTimeout(() => tryAutoPopup(list, () => {}), 900);
      })
      .catch((e) => {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[ShootingAnnouncements] bootstrapGame 初期取得エラー:', e);
        }
        ensureGameAnnouncementFab();
      });
  }

  global.ShootingAnnouncements = {
    getAck,
    markPopupSeen,
    markRead,
    unseenCount,
    firstUnreadAnnouncement,
    fetchPublicList,
    bootstrapIndex,
    bootstrapMypage,
    bootstrapGame,
    openListModal,
    showDetailModal,
    updateBadgeEl,
    renderHomeAnnouncementButton
  };
})(typeof window !== 'undefined' ? window : this);
