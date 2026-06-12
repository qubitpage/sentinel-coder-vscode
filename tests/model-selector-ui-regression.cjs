const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sidebarPath = path.join(root, 'media', 'sidebar.js');
const sidebarJs = fs.readFileSync(sidebarPath, 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

class MockNode {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.eventListeners = {};
    this.className = '';
    this.id = '';
    this.value = '';
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.checked = false;
    this.type = '';
    this.label = '';
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    if (child.id && this.ownerDocument) this.ownerDocument._elementsById[child.id] = child;
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && !this.value) this.value = child.value;
    return child;
  }

  insertBefore(child, before) {
    if (!child) return child;
    child.parentNode = this;
    const idx = before ? this.children.indexOf(before) : -1;
    if (idx >= 0) this.children.splice(idx, 0, child);
    else this.children.push(child);
    if (child.id && this.ownerDocument) this.ownerDocument._elementsById[child.id] = child;
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && !this.value) this.value = child.value;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') {
      this.id = String(value);
      if (this.ownerDocument) this.ownerDocument._elementsById[this.id] = this;
    }
    if (name === 'value') this.value = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    (this.eventListeners[type] ||= []).push(handler);
  }

  dispatchEvent(event) {
    const list = this.eventListeners[event.type] || [];
    for (const fn of list) fn.call(this, event);
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}

  get options() {
    if (this.tagName !== 'SELECT') return undefined;
    const out = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        if (child.tagName === 'OPTION') out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || this.children.map((c) => c.textContent || '').join('');
  }
}

class MockDocument {
  constructor() {
    this._elementsById = {};
    this.body = this.createElement('body');
  }

  createElement(tag) {
    return new MockNode(tag, this);
  }

  createTextNode(text) {
    const node = new MockNode('#text', this);
    node.textContent = String(text || '');
    return node;
  }

  getElementById(id) {
    if (!this._elementsById[id]) {
      const tag = id === 'model-select' ? 'select' : 'div';
      const el = this.createElement(tag);
      el.id = id;
      this._elementsById[id] = el;
      this.body.appendChild(el);
    }
    return this._elementsById[id];
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
}

const listeners = {};
const postedMessages = [];
const document = new MockDocument();
const window = {
  document,
  addEventListener(type, handler) { listeners[type] = handler; },
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 1; },
  clearTimeout() {},
};

const context = {
  window,
  document,
  console,
  acquireVsCodeApi() {
    return {
      postMessage(msg) { postedMessages.push(msg); },
      getState() { return {}; },
      setState() {},
    };
  },
  setTimeout: window.setTimeout,
  clearTimeout: window.clearTimeout,
  Event: function Event(type) { this.type = type; },
};
context.global = context;

vm.createContext(context);
vm.runInContext(sidebarJs, context, { filename: sidebarPath });

assert(typeof listeners.message === 'function', 'sidebar.js must register a window message handler');

function send(data) {
  listeners.message({ data });
}

send({
  type: 'agenticProfileList',
  currentId: 'standard-single-model',
  profiles: [
    { id: 'standard-single-model', name: 'Standard Single Model', description: 'direct' },
    { id: 'premium-architect', name: 'Premium Architect + Strong Agents', description: 'safe premium profile' },
  ],
});

send({
  type: 'modelList',
  selected: 'azure:gpt-5.5',
  models: [
    { name: 'auto', id: 'auto', displayName: 'Auto (best for task)', provider: 'auto', pricing: 'auto' },
    { id: 'agentic:premium-architect', name: 'agentic:premium-architect', displayName: 'Premium Architect + Strong Agents', provider: 'agentic' },
    { id: 'azure:gpt-5.5', name: 'azure:gpt-5.5', displayName: 'Azure GPT-5.5', provider: 'azure', contextWindow: 1048576, effectiveContextWindow: 1048576, maxOutputTokens: 128000, supportsTools: true, pricing: 'subscription' },
    { id: 'azure:model-router', name: 'azure:model-router', displayName: 'Azure Model Router', provider: 'azure', contextWindow: 200000, maxOutputTokens: 32768, supportsTools: true, pricing: 'subscription' },
    { id: 'groq:openai/gpt-oss-120b', name: 'groq:openai/gpt-oss-120b', displayName: 'Groq GPT OSS 120B', provider: 'groq', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, pricing: 'free-tier' },
    { id: 'openrouter:qwen/qwen3-coder:free', name: 'openrouter:qwen/qwen3-coder:free', displayName: 'Qwen3 Coder Free', provider: 'openrouter', contextWindow: 262144, maxOutputTokens: 32768, supportsTools: true, pricing: 'free' },
  ],
});

const select = document.getElementById('model-select');
const values = select.options.map((o) => o.value);
const labels = select.options.map((o) => o.textContent);

assert(values.includes('auto'), 'dropdown must include Auto option');
assert(values.includes('agentic:premium-architect'), 'dropdown must include agentic profiles');
assert(values.includes('azure:gpt-5.5'), 'dropdown must include configured Azure provider model');
assert(values.includes('azure:model-router'), 'dropdown must include Azure model-router fallback');
assert(values.includes('groq:openai/gpt-oss-120b'), 'dropdown must include configured Groq provider model');
assert(values.includes('openrouter:qwen/qwen3-coder:free'), 'dropdown must include configured OpenRouter provider model');
assert(select.value === 'azure:gpt-5.5', 'dropdown must preserve selected provider model');
assert(values.filter((v) => v === 'auto').length === 1, 'Auto option must not be duplicated');
assert(values.length > 3, 'dropdown must not collapse to Auto/profile-only');
assert(labels.some((l) => /Azure OpenAI|Azure AI Foundry|Azure/i.test(l)), 'dropdown labels/groups should expose Azure provider context');

send({
  type: 'modelList',
  selected: 'azure:gpt-5.5',
  models: [{ name: 'auto', id: 'auto', displayName: 'Auto (best for task)', provider: 'auto' }],
});

const valuesAfterAutoOnly = select.options.map((o) => o.value);
assert(valuesAfterAutoOnly.includes('azure:gpt-5.5'), 'Auto-only refresh must preserve last good provider model list');
assert(valuesAfterAutoOnly.includes('groq:openai/gpt-oss-120b'), 'Auto-only refresh must not wipe provider models');
assert(select.value === 'azure:gpt-5.5', 'Auto-only refresh must not change selected provider model');

send({ type: 'thinkingChunk', content: 'PRIVATE_REASONING_SHOULD_NOT_RENDER' });
assert(!document.body.innerHTML.includes('PRIVATE_REASONING_SHOULD_NOT_RENDER'), 'private reasoning chunk must not render in webview DOM');

process.stdout.write('model-selector-ui-regression: ok\n');
