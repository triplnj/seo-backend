'use strict';

const API_BASE_URL =
  'https://seo-backend-2o5u.onrender.com';

const LICENSE_STORAGE_KEYS = {
  licenseKey: 'seoLicenseKey',
  instanceId: 'seoLicenseInstanceId',
  deviceId: 'seoLicenseDeviceId'
};

const TARGET_TAB_ID_KEY = 'seoTargetTabId';
const TARGET_TAB_URL_KEY = 'seoTargetTabUrl';

const licenseState = {
  active: false,
  accessMode: 'checking',
  trial: {
    limit: 3,
    used: 0,
    remaining: 0
  },
  config: {
    checkoutUrl: '',
    billingUrl: '',
    priceLabel: '€9.99/month'
  },
  elements: null
};

async function getTargetTab() {
  const storedData =
    await chrome.storage.session.get([
      TARGET_TAB_ID_KEY,
      TARGET_TAB_URL_KEY
    ]);

  const tabId = storedData[TARGET_TAB_ID_KEY];

  if (!Number.isInteger(tabId)) {
    throw new Error(
      'Open the extension by clicking its icon while the Shopify or ChatGPT tab is active.'
    );
  }

  try {
    const tab = await chrome.tabs.get(tabId);

    return {
      id: tab.id,
      url:
        tab.url ||
        storedData[TARGET_TAB_URL_KEY] ||
        '',
      windowId: tab.windowId
    };
  } catch {
    throw new Error(
      'The original Shopify or ChatGPT tab is no longer available. Activate that tab and click the extension icon again.'
    );
  }
}

async function openExternalUrl(url) {
  if (!url) {
    throw new Error('The requested link is not configured.');
  }

  let targetTab = null;

  try {
    targetTab = await getTargetTab();
  } catch {
    targetTab = null;
  }

  let targetWindowId =
    targetTab?.windowId;

  if (!Number.isInteger(targetWindowId)) {
    const normalWindows =
      await chrome.windows.getAll({
        windowTypes: ['normal']
      });

    const focusedNormalWindow =
      normalWindows.find(
        windowItem => windowItem.focused
      );

    targetWindowId =
      focusedNormalWindow?.id ||
      normalWindows[0]?.id;
  }

  await chrome.tabs.create({
    url,
    active: true,
    ...(Number.isInteger(targetWindowId)
      ? { windowId: targetWindowId }
      : {})
  });
}

async function requestJson(path, options = {}) {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    options
  );

  const rawResponse = await response.text();
  let data = {};

  try {
    data = rawResponse
      ? JSON.parse(rawResponse)
      : {};
  } catch {
    const error = new Error(
      `Invalid server response (${response.status}).`
    );

    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
      `Server returned status ${response.status}.`
    );

    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getStoredLicense() {
  const stored =
    await chrome.storage.local.get([
      LICENSE_STORAGE_KEYS.licenseKey,
      LICENSE_STORAGE_KEYS.instanceId,
      LICENSE_STORAGE_KEYS.deviceId
    ]);

  return {
    licenseKey:
      stored[LICENSE_STORAGE_KEYS.licenseKey] ||
      '',
    instanceId:
      stored[LICENSE_STORAGE_KEYS.instanceId] ||
      '',
    deviceId:
      stored[LICENSE_STORAGE_KEYS.deviceId] ||
      ''
  };
}

async function getOrCreateDeviceId() {
  const stored = await getStoredLicense();

  if (stored.deviceId) {
    return stored.deviceId;
  }

  const deviceId =
    globalThis.crypto?.randomUUID?.() ||
    `chrome-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

  await chrome.storage.local.set({
    [LICENSE_STORAGE_KEYS.deviceId]:
      deviceId
  });

  return deviceId;
}

async function saveActivatedLicense({
  licenseKey,
  instanceId,
  deviceId
}) {
  await chrome.storage.local.set({
    [LICENSE_STORAGE_KEYS.licenseKey]:
      licenseKey,
    [LICENSE_STORAGE_KEYS.instanceId]:
      instanceId,
    [LICENSE_STORAGE_KEYS.deviceId]:
      deviceId
  });
}

async function clearStoredLicense({
  keepDeviceId = true
} = {}) {
  const keysToRemove = [
    LICENSE_STORAGE_KEYS.licenseKey,
    LICENSE_STORAGE_KEYS.instanceId
  ];

  if (!keepDeviceId) {
    keysToRemove.push(
      LICENSE_STORAGE_KEYS.deviceId
    );
  }

  await chrome.storage.local.remove(
    keysToRemove
  );
}

function setLicenseFeedback(message, isError = false) {
  const feedback =
    licenseState.elements?.licenseFeedback;

  if (!feedback) return;

  feedback.textContent = message || '';
  feedback.classList.toggle(
    'form-feedback--error',
    Boolean(isError)
  );
}

function setAppAccess(enabled) {
  const elements = licenseState.elements;

  if (!elements) return;

  elements.appContent.disabled = !enabled;
  elements.appContent.classList.toggle(
    'app-content--locked',
    !enabled
  );

  elements.generateButton.disabled = !enabled;
}

function setTrialUi({
  limit = 3,
  used = 0,
  remaining = 0
}) {
  const elements = licenseState.elements;

  if (!elements) return;

  const normalizedLimit = Math.max(
    Number(limit) || 3,
    0
  );
  const normalizedUsed = Math.max(
    Number(used) || 0,
    0
  );
  const normalizedRemaining = Math.max(
    Number(remaining) || 0,
    0
  );

  licenseState.active = false;
  licenseState.trial = {
    limit: normalizedLimit,
    used: normalizedUsed,
    remaining: normalizedRemaining
  };

  if (normalizedRemaining > 0) {
    licenseState.accessMode = 'trial';

    elements.trialCard.hidden = false;
    elements.licenseCard.hidden = true;
    elements.trialBadge.textContent =
      `${normalizedRemaining} left`;
    elements.trialMessage.textContent =
      normalizedRemaining === 1
        ? 'You have 1 free generation remaining. All features are available during the trial.'
        : `You have ${normalizedRemaining} free generations remaining. All features are available during the trial.`;

    setAppAccess(true);
    return;
  }

  setLicenseUi({
    state: 'inactive',
    message:
      'Your 3 free generations have been used. Upgrade to Pro to continue.'
  });
}

function setLicenseUi({
  state,
  message,
  expiresAt = null
}) {
  const elements = licenseState.elements;

  if (!elements) return;

  const active = state === 'active';
  licenseState.active = active;
  licenseState.accessMode = active
    ? 'pro'
    : state === 'checking'
      ? 'checking'
      : 'locked';

  elements.trialCard.hidden = true;
  elements.licenseCard.hidden =
    state === 'checking';

  setAppAccess(active);

  elements.subscriptionStatus.textContent =
    active
      ? 'Pro subscription active'
      : state === 'checking'
        ? 'Checking subscription'
        : state === 'error'
          ? 'Verification unavailable'
          : 'Pro subscription required';

  elements.statusBadge.textContent =
    active
      ? 'Active'
      : state === 'checking'
        ? 'Checking'
        : state === 'error'
          ? 'Error'
          : 'Inactive';

  elements.statusBadge.className =
    `status-badge status-badge--${state}`;

  const expiryText =
    active && expiresAt
      ? ` Access valid until ${new Date(
          expiresAt
        ).toLocaleDateString()}.`
      : '';

  elements.subscriptionMessage.textContent =
    `${message || ''}${expiryText}`.trim();

  elements.inactiveLicenseActions.hidden =
    active;

  elements.activeLicenseActions.hidden =
    !active;

  elements.licenseKeyInput.disabled =
    state === 'checking';

  elements.activateLicenseBtn.disabled =
    state === 'checking';
}

async function loadLicenseConfig() {
  try {
    const config = await requestJson(
      '/api/license/config'
    );

    licenseState.config = {
      checkoutUrl:
        config.checkoutUrl || '',
      billingUrl:
        config.billingUrl || '',
      priceLabel:
        config.priceLabel ||
        '€9.99/month'
    };

    if (licenseState.elements?.priceLabel) {
      licenseState.elements.priceLabel.textContent =
        licenseState.config.priceLabel;
    }
  } catch (error) {
    console.error(
      'Unable to load subscription configuration:',
      error
    );

    setLicenseFeedback(
      'Subscription links are temporarily unavailable.',
      true
    );
  }
}

async function validateStoredLicense() {
  const stored = await getStoredLicense();

  if (!stored.licenseKey || !stored.instanceId) {
    return false;
  }

  setLicenseUi({
    state: 'checking',
    message:
      'Verifying the saved license...'
  });

  try {
    const validation = await requestJson(
      '/api/license/validate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          licenseKey: stored.licenseKey,
          instanceId: stored.instanceId
        })
      }
    );

    if (!validation.valid) {
      await clearStoredLicense();
      return false;
    }

    setLicenseUi({
      state: 'active',
      message:
        'All generator and injection features are unlocked.',
      expiresAt: validation.expiresAt
    });

    return true;
  } catch (error) {
    console.error(
      'License validation error:',
      error
    );

    setLicenseUi({
      state: 'error',
      message:
        error.message ||
        'Unable to verify the subscription.'
    });

    return null;
  }
}

async function loadTrialStatus() {
  try {
    const deviceId =
      await getOrCreateDeviceId();

    const trial = await requestJson(
      '/api/trial/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId })
      }
    );

    setTrialUi(trial);
    return trial;
  } catch (error) {
    console.error(
      'Trial status error:',
      error
    );

    setLicenseUi({
      state: 'error',
      message:
        error.message ||
        'Unable to load the free trial status.'
    });

    return null;
  }
}

/**
 * Učitava istoriju iz localStorage-a.
 */
function getHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('seoHistory'));

    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error('Error reading history:', error);
    return [];
  }
}

/**
 * Prikazuje poslednjih pet generisanih briefova.
 */
function renderHistory() {
  const historyList = document.getElementById('historyList');
  const result = document.getElementById('result');

  if (!historyList) {
    console.warn('Element #historyList was not found.');
    return;
  }

  historyList.innerHTML = '';

  const history = getHistory();

  history.forEach((item, index) => {
    const li = document.createElement('li');
    const date = item.timestamp
      ? new Date(item.timestamp).toLocaleString()
      : '';

    li.textContent =
      `${index + 1}. ${item.keyword || 'Untitled'} ` +
      `(${item.language || 'Unknown'}, ${item.mode || 'Unknown'}) — ${date}`;

    li.style.cursor = 'pointer';
    li.style.marginBottom = '5px';

    li.addEventListener('click', () => {
      if (result) {
        result.value = item.brief || '';
      }
    });

    historyList.appendChild(li);
  });
}

/**
 * Čuva generisani brief u istoriju.
 */
function saveToHistory(historyItem) {
  let history = getHistory();

  history.unshift(historyItem);
  history = history.slice(0, 5);

  localStorage.setItem('seoHistory', JSON.stringify(history));
  renderHistory();
}

/**
 * Ubacuje sadržaj u Shopify editor.
 *
 * Ova funkcija se izvršava unutar aktivne stranice,
 * zato mora biti samostalna.
 */
function insertIntoShopifyEditor(text) {
  function findEditableParent(node) {
    if (!node) return null;

    let element =
      node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement;

    while (element) {
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement ||
        element.isContentEditable ||
        element.getAttribute?.('contenteditable') === 'true' ||
        element.getAttribute?.('contenteditable') === 'plaintext-only' ||
        element.getAttribute?.('role') === 'textbox'
      ) {
        return element;
      }

      element = element.parentElement;
    }

    return null;
  }

  function getDeepActiveElement(root) {
    let activeElement = root.activeElement;

    while (
      activeElement &&
      activeElement.shadowRoot &&
      activeElement.shadowRoot.activeElement
    ) {
      activeElement = activeElement.shadowRoot.activeElement;
    }

    return activeElement;
  }

  function dispatchEditorEvents(element, insertedText) {
    try {
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: insertedText
        })
      );
    } catch (error) {
      element.dispatchEvent(
        new Event('input', {
          bubbles: true,
          composed: true
        })
      );
    }

    element.dispatchEvent(
      new Event('change', {
        bubbles: true,
        composed: true
      })
    );

    element.dispatchEvent(
      new Event('blur', {
        bubbles: true,
        composed: true
      })
    );
  }

  function insertIntoTextControl(element, insertedText) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      'value'
    );

    element.focus();

    if (descriptor?.set) {
      descriptor.set.call(element, insertedText);
    } else {
      element.value = insertedText;
    }

    dispatchEditorEvents(element, insertedText);

    return true;
  }

  function insertIntoContentEditable(element, insertedText) {
    element.focus();

    const ownerDocument = element.ownerDocument;
    const selection = ownerDocument.getSelection();
    const range = ownerDocument.createRange();

    range.selectNodeContents(element);

    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;

    try {
      inserted = ownerDocument.execCommand(
        'insertText',
        false,
        insertedText
      );
    } catch (error) {
      inserted = false;
    }

    if (!inserted) {
      element.replaceChildren();

      const lines = insertedText.split('\n');

      for (const line of lines) {
        const paragraph = ownerDocument.createElement('p');

        if (line.length > 0) {
          paragraph.textContent = line;
        } else {
          paragraph.appendChild(
            ownerDocument.createElement('br')
          );
        }

        element.appendChild(paragraph);
      }
    }

    dispatchEditorEvents(element, insertedText);

    return true;
  }

  function insertIntoElement(element, insertedText) {
    if (!element) return false;

    if (
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLInputElement
    ) {
      return insertIntoTextControl(element, insertedText);
    }

    if (
      element.isContentEditable ||
      element.getAttribute?.('contenteditable') === 'true' ||
      element.getAttribute?.('contenteditable') ===
        'plaintext-only' ||
      element.getAttribute?.('role') === 'textbox'
    ) {
      return insertIntoContentEditable(element, insertedText);
    }

    return false;
  }

  if (!text || !text.trim()) {
    return {
      success: false,
      reason: 'Text is empty',
      frameUrl: window.location.href
    };
  }

  /*
   * 1. Pokušaj preko trenutno izabranog teksta/kursora.
   */
  const selection = document.getSelection();

  if (selection && selection.rangeCount > 0) {
    const selectedEditor = findEditableParent(
      selection.anchorNode
    );

    if (selectedEditor) {
      try {
        insertIntoElement(selectedEditor, text);

        return {
          success: true,
          method: 'selection',
          editorType:
            selectedEditor.tagName ||
            selectedEditor.getAttribute?.('role'),
          frameUrl: window.location.href
        };
      } catch (error) {
        console.error(
          'Selection editor insertion failed:',
          error
        );
      }
    }
  }

  /*
   * 2. Pokušaj preko poslednjeg fokusiranog elementa.
   */
  const activeElement = getDeepActiveElement(document);

  if (activeElement) {
    const activeEditor =
      findEditableParent(activeElement) ||
      (activeElement.shadowRoot
        ? findEditableParent(
            activeElement.shadowRoot.activeElement
          )
        : null);

    if (activeEditor) {
      try {
        insertIntoElement(activeEditor, text);

        return {
          success: true,
          method: 'active-element',
          editorType:
            activeEditor.tagName ||
            activeEditor.getAttribute?.('role'),
          frameUrl: window.location.href
        };
      } catch (error) {
        console.error(
          'Active editor insertion failed:',
          error
        );
      }
    }
  }

  /*
   * 3. Pokušaj direktnog browser insertText poziva.
   *
   * Ovo ponekad radi čak i kada je editor unutar zatvorenog
   * shadow DOM-a i nije direktno dostupan selektorima.
   */
  try {
    const inserted = document.execCommand(
      'insertText',
      false,
      text
    );

    if (inserted) {
      return {
        success: true,
        method: 'document-exec-command',
        frameUrl: window.location.href
      };
    }
  } catch (error) {
    console.error(
      'Document insertText failed:',
      error
    );
  }

  return {
    success: false,
    reason: 'No focused Shopify editor found',
    activeElement: activeElement?.tagName || null,
    activeElementId: activeElement?.id || null,
    activeElementRole:
      activeElement?.getAttribute?.('role') || null,
    selectionExists: Boolean(
      selection && selection.rangeCount > 0
    ),
    frameUrl: window.location.href
  };
}

/**
 * Ubacuje sadržaj u ChatGPT editor.
 *
 * Ova funkcija se izvršava unutar aktivne stranice,
 * zato mora biti samostalna.
 */
function insertIntoChatGPTEditor(text) {
  const editor = document.querySelector(
    'div.ProseMirror[contenteditable="true"]'
  );

  if (!editor) {
    alert('ChatGPT editor nije pronađen.');
    return;
  }

  editor.focus();
  editor.innerHTML = '';

  const paragraph = document.createElement('p');
  paragraph.textContent = text;

  editor.appendChild(paragraph);

  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: text
    })
  );

  editor.dispatchEvent(
    new Event('change', {
      bubbles: true,
      composed: true
    })
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  const themeToggle = document.getElementById('themeToggle');
  const generateButton = document.getElementById('generate');
  const copyButton = document.getElementById('copyBtn');
  const downloadButton = document.getElementById('downloadBtn');
  const sendToChatGPTButton =
    document.getElementById('sendToChatGPT');
  const clearHistoryButton =
    document.getElementById('clearHistoryBtn');
  const injectShopifyButton =
    document.getElementById('injectShopify');
  const injectToChatGPTButton =
    document.getElementById('injectToChatGPT');
  const result = document.getElementById('result');

  const appContent =
    document.getElementById('appContent');
  const trialCard =
    document.getElementById('trialCard');
  const trialBadge =
    document.getElementById('trialBadge');
  const trialMessage =
    document.getElementById('trialMessage');
  const licenseCard =
    document.getElementById('licenseCard');
  const subscriptionStatus =
    document.getElementById('subscriptionStatus');
  const subscriptionMessage =
    document.getElementById('subscriptionMessage');
  const statusBadge =
    document.getElementById('statusBadge');
  const priceLabel =
    document.getElementById('priceLabel');
  const inactiveLicenseActions =
    document.getElementById('inactiveLicenseActions');
  const activeLicenseActions =
    document.getElementById('activeLicenseActions');
  const licenseKeyInput =
    document.getElementById('licenseKeyInput');
  const activateLicenseBtn =
    document.getElementById('activateLicenseBtn');
  const upgradeBtn =
    document.getElementById('upgradeBtn');
  const manageSubscriptionBtn =
    document.getElementById('manageSubscriptionBtn');
  const deactivateLicenseBtn =
    document.getElementById('deactivateLicenseBtn');
  const licenseFeedback =
    document.getElementById('licenseFeedback');

  licenseState.elements = {
    appContent,
    trialCard,
    trialBadge,
    trialMessage,
    licenseCard,
    subscriptionStatus,
    subscriptionMessage,
    statusBadge,
    priceLabel,
    inactiveLicenseActions,
    activeLicenseActions,
    licenseKeyInput,
    activateLicenseBtn,
    upgradeBtn,
    manageSubscriptionBtn,
    deactivateLicenseBtn,
    licenseFeedback,
    generateButton
  };

  if (
    chrome.storage.local.setAccessLevel
  ) {
    try {
      await chrome.storage.local.setAccessLevel({
        accessLevel: 'TRUSTED_CONTEXTS'
      });
    } catch (error) {
      console.warn(
        'Unable to restrict storage access level:',
        error
      );
    }
  }


  /*
   * Tema
   */
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');

      const isDark =
        document.body.classList.contains('dark-mode');

      localStorage.setItem(
        'theme',
        isDark ? 'dark' : 'light'
      );
    });
  }


  /*
   * Pretplata i Lemon Squeezy licenca
   */
  if (upgradeBtn) {
    upgradeBtn.addEventListener(
      'click',
      async () => {
        try {
          await openExternalUrl(
            licenseState.config.checkoutUrl
          );
        } catch (error) {
          setLicenseFeedback(
            error.message,
            true
          );
        }
      }
    );
  }

  if (manageSubscriptionBtn) {
    manageSubscriptionBtn.addEventListener(
      'click',
      async () => {
        try {
          await openExternalUrl(
            licenseState.config.billingUrl
          );
        } catch (error) {
          setLicenseFeedback(
            error.message,
            true
          );
        }
      }
    );
  }

  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener(
      'click',
      async () => {
        const licenseKey =
          licenseKeyInput?.value?.trim() || '';

        if (!licenseKey) {
          setLicenseFeedback(
            'Enter the license key from your Lemon Squeezy receipt.',
            true
          );
          return;
        }

        const originalText =
          activateLicenseBtn.textContent;

        activateLicenseBtn.disabled = true;
        activateLicenseBtn.textContent =
          'Activating...';
        setLicenseFeedback('');

        try {
          const deviceId =
            await getOrCreateDeviceId();

          const activation =
            await requestJson(
              '/api/license/activate',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json'
                },
                body: JSON.stringify({
                  licenseKey,
                  instanceName:
                    `Chrome-${deviceId.slice(
                      0,
                      12
                    )}`
                })
              }
            );

          if (
            !activation.success ||
            !activation.instanceId
          ) {
            throw new Error(
              activation.error ||
              'License activation failed.'
            );
          }

          await saveActivatedLicense({
            licenseKey,
            instanceId:
              activation.instanceId,
            deviceId
          });

          licenseKeyInput.value = '';

          setLicenseUi({
            state: 'active',
            message:
              'License activated. All Pro features are unlocked.',
            expiresAt:
              activation.expiresAt
          });

          setLicenseFeedback(
            'License activated successfully.'
          );
        } catch (error) {
          console.error(
            'License activation error:',
            error
          );

          await loadTrialStatus();

          setLicenseFeedback(
            error.message ||
              'License activation failed.',
            true
          );
        } finally {
          activateLicenseBtn.textContent =
            originalText || 'Activate';
          activateLicenseBtn.disabled =
            false;
        }
      }
    );
  }

  if (deactivateLicenseBtn) {
    deactivateLicenseBtn.addEventListener(
      'click',
      async () => {
        const confirmed = confirm(
          'Deactivate this license on this device?'
        );

        if (!confirmed) return;

        const stored =
          await getStoredLicense();

        if (
          !stored.licenseKey ||
          !stored.instanceId
        ) {
          await clearStoredLicense();

          await loadTrialStatus();
          return;
        }

        const originalText =
          deactivateLicenseBtn.textContent;

        deactivateLicenseBtn.disabled =
          true;
        deactivateLicenseBtn.textContent =
          'Deactivating...';

        try {
          await requestJson(
            '/api/license/deactivate',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: JSON.stringify({
                licenseKey:
                  stored.licenseKey,
                instanceId:
                  stored.instanceId
              })
            }
          );

          await clearStoredLicense();

          await loadTrialStatus();

          setLicenseFeedback(
            'License deactivated on this device.'
          );
        } catch (error) {
          console.error(
            'License deactivation error:',
            error
          );

          setLicenseFeedback(
            error.message ||
              'Unable to deactivate this device.',
            true
          );
        } finally {
          deactivateLicenseBtn.textContent =
            originalText ||
            'Deactivate this device';
          deactivateLicenseBtn.disabled =
            false;
        }
      }
    );
  }

  /*
   * Generisanje briefa
   */
  if (generateButton) {
    generateButton.addEventListener('click', async () => {
      const keywordElement =
        document.getElementById('keyword');
      const pageTypeElement =
        document.getElementById('pageType');
      const languageElement =
        document.getElementById('language');
      const audienceElement =
        document.getElementById('audience');
      const toneElement =
        document.getElementById('tone');

      const selectedMode = document.querySelector(
        'input[name="mode"]:checked'
      );

      const keyword = keywordElement?.value.trim() || '';
      const pageType = pageTypeElement?.value || '';
      const language = languageElement?.value || '';
      const audience = audienceElement?.value || '';
      const tone = toneElement?.value || '';
      const mode = selectedMode?.value || '';

      const storedLicense =
        await getStoredLicense();
      const deviceId =
        await getOrCreateDeviceId();

      const hasProLicense =
        licenseState.active &&
        Boolean(storedLicense.licenseKey) &&
        Boolean(storedLicense.instanceId);

      if (
        !hasProLicense &&
        licenseState.trial.remaining <= 0
      ) {
        setTrialUi(licenseState.trial);
        alert(
          'Your free trial has ended. Upgrade to Pro to continue.'
        );
        return;
      }

      if (!keyword || !pageType || !language) {
        alert('Please fill in all required fields.');
        return;
      }

      if (!selectedMode) {
        alert('Please select a mode.');
        return;
      }

      const originalButtonText =
        generateButton.textContent;

      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/brief`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              keyword,
              pageType,
              language,
              mode,
              audience,
              tone,
              deviceId,
              ...(hasProLicense
                ? {
                    licenseKey:
                      storedLicense.licenseKey,
                    instanceId:
                      storedLicense.instanceId
                  }
                : {})
            })
          }
        );

        let data;

        try {
          data = await response.json();
        } catch (jsonError) {
          throw new Error(
            `Invalid server response (${response.status}).`
          );
        }

        if (!response.ok) {
          if (
            data.code === 'LICENSE_REQUIRED' ||
            data.code === 'LICENSE_INVALID'
          ) {
            await clearStoredLicense();
            await loadTrialStatus();
          }

          if (data.code === 'TRIAL_EXHAUSTED') {
            setTrialUi(
              data.trial || {
                limit: 3,
                used: 3,
                remaining: 0
              }
            );
          }

          throw new Error(
            data.error ||
              `Server returned status ${response.status}.`
          );
        }

        if (!data.brief) {
          throw new Error(
            data.error || 'The server did not return a brief.'
          );
        }

        if (result) {
          result.value = data.brief;
        }

        const historyItem = {
          keyword,
          pageType,
          language,
          audience,
          tone,
          mode,
          brief: data.brief,
          timestamp: new Date().toISOString()
        };

        saveToHistory(historyItem);

        if (data.trial) {
          setTrialUi(data.trial);
        }
      } catch (error) {
        console.error('Error generating brief:', error);

        alert(
          `Error generating brief: ${
            error.message || 'Unknown error'
          }`
        );
      } finally {
        generateButton.disabled =
          !['trial', 'pro'].includes(
            licenseState.accessMode
          );
        generateButton.textContent =
          originalButtonText || 'Generate';
      }
    });
  } else {
    console.error('Element #generate was not found.');
  }

  /*
   * Kopiranje teksta
   */
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const text = result?.value || '';

      if (!text.trim()) {
        alert('There is no text to copy.');
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        alert('Text copied to clipboard!');
      } catch (error) {
        console.error('Error copying text:', error);
        alert('Unable to copy the text.');
      }
    });
  }

  /*
   * Preuzimanje TXT fajla
   */
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      const text = result?.value || '';

      if (!text.trim()) {
        alert('There is no text to download.');
        return;
      }

      const blob = new Blob([text], {
        type: 'text/plain;charset=utf-8'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'seo_brief.txt';

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    });
  }

  /*
   * Kopiranje prompta i otvaranje ChatGPT-a
   */
  if (sendToChatGPTButton) {
    sendToChatGPTButton.addEventListener(
      'click',
      async () => {
        const text = result?.value || '';

        if (!text.trim()) {
          alert('There is no text to send.');
          return;
        }

        const prompt =
          'Humanize this text and find something especially ' +
          `interesting:\n\n${text}`;

        try {
          await navigator.clipboard.writeText(prompt);

          window.open(
            'https://chatgpt.com/',
            '_blank',
            'noopener,noreferrer'
          );
        } catch (error) {
          console.error(
            'Error preparing ChatGPT prompt:',
            error
          );

          alert('Unable to copy the prompt.');
        }
      }
    );
  }

  /*
   * Brisanje istorije
   */
  if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', () => {
      localStorage.removeItem('seoHistory');
      renderHistory();
    });
  }

  /*
   * Ubacivanje u Shopify
   */
  if (injectShopifyButton) {
    injectShopifyButton.addEventListener(
    'click',
    async () => {
      const brief = result?.value?.trim() || '';

      if (!brief) {
        alert('Nothing to inject!');
        return;
      }

      try {
        const activeTab =
          await getTargetTab();

        if (!activeTab?.id) {
          throw new Error(
            'Active Shopify tab was not found.'
          );
        }

        const activeUrl = activeTab.url || '';

        if (
          activeUrl.startsWith('chrome://') ||
          activeUrl.startsWith('chrome-extension://') ||
          activeUrl.startsWith('edge://') ||
          activeUrl.startsWith('about:')
        ) {
          throw new Error(
            'Open the Shopify blog editor before using this button.'
          );
        }

        const injectionResults =
          await chrome.scripting.executeScript({
            target: {
              tabId: activeTab.id,
              allFrames: true
            },
            world: 'MAIN',
            func: insertIntoShopifyEditor,
            args: [brief]
          });

        console.log(
          'Shopify injection results:',
          injectionResults
        );

        const successfulResult =
          injectionResults.find(
            item => item.result?.success === true
          );

        if (!successfulResult) {
          const diagnostics = injectionResults
            .map(item => item.result)
            .filter(Boolean);

          console.error(
            'Shopify editor diagnostics:',
            diagnostics
          );

          throw new Error(
            'Shopify editor was not focused. ' +
              'Click inside the Content editor first, ' +
              'then open the extension and try again.'
          );
        }

        alert('Text inserted into Shopify.');
      } catch (error) {
        console.error(
          'Shopify script injection error:',
          error
        );

        alert(
          'Unable to inject into Shopify:\n\n' +
            (error?.message || 'Unknown error')
        );
      }
    }
  );
}

  /*
   * Ubacivanje u ChatGPT
   */
  if (injectToChatGPTButton) {
    injectToChatGPTButton.addEventListener(
      'click',
      async () => {
        const brief = result?.value || '';

        if (!brief.trim()) {
          alert('No text to inject.');
          return;
        }

        try {
          const activeTab =
            await getTargetTab();

          if (!activeTab?.id) {
            throw new Error('Active tab was not found.');
          }

          await chrome.scripting.executeScript({
            target: {
              tabId: activeTab.id
            },
            func: insertIntoChatGPTEditor,
            args: [brief]
          });
        } catch (error) {
          console.error(
            'ChatGPT script injection error:',
            error
          );

          alert(
            'Unable to inject the text into ChatGPT. ' +
              'Check the extension permissions.'
          );
        }
      }
    );
  }

  renderHistory();

  setLicenseUi({
    state: 'checking',
    message:
      'Loading access status...'
  });

  await loadLicenseConfig();

  const licenseResult =
    await validateStoredLicense();

  if (licenseResult === false) {
    await loadTrialStatus();
  }
});