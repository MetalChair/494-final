var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function beforeUpdate(fn) {
        get_current_component().$$.before_update.push(fn);
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const current_edit_workout = writable({});
    const editor_target = writable(null);
    const current_flex = writable(0);

    /* src\router-item.svelte generated by Svelte v3.37.0 */

    function create_fragment$b(ctx) {
    	let a;
    	let li;
    	let span;
    	let t0;
    	let t1;
    	let t2;

    	return {
    		c() {
    			a = element("a");
    			li = element("li");
    			span = element("span");
    			t0 = text(/*icon*/ ctx[2]);
    			t1 = space();
    			t2 = text(/*label*/ ctx[3]);
    			attr(span, "class", "material-icons");
    			attr(li, "class", "collection-item");
    			attr(li, "id", "home-button");
    			toggle_class(li, "active", /*active*/ ctx[1] === true);
    			attr(a, "href", /*path*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);
    			append(a, li);
    			append(li, span);
    			append(span, t0);
    			append(li, t1);
    			append(li, t2);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*icon*/ 4) set_data(t0, /*icon*/ ctx[2]);
    			if (dirty & /*label*/ 8) set_data(t2, /*label*/ ctx[3]);

    			if (dirty & /*active*/ 2) {
    				toggle_class(li, "active", /*active*/ ctx[1] === true);
    			}

    			if (dirty & /*path*/ 1) {
    				attr(a, "href", /*path*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { path } = $$props,
    		{ active } = $$props,
    		{ icon } = $$props,
    		{ label } = $$props;

    	$$self.$$set = $$props => {
    		if ("path" in $$props) $$invalidate(0, path = $$props.path);
    		if ("active" in $$props) $$invalidate(1, active = $$props.active);
    		if ("icon" in $$props) $$invalidate(2, icon = $$props.icon);
    		if ("label" in $$props) $$invalidate(3, label = $$props.label);
    	};

    	return [path, active, icon, label];
    }

    class Router_item extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { path: 0, active: 1, icon: 2, label: 3 });
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function elasticOut(t) {
        return (Math.sin((-13.0 * (t + 1.0) * Math.PI) / 2) * Math.pow(2.0, -10.0 * t) + 1.0);
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* src\components\live-readout.svelte generated by Svelte v3.37.0 */

    function create_fragment$a(ctx) {
    	let div;
    	let b0;
    	let t0;
    	let t1;
    	let b1;

    	return {
    		c() {
    			div = element("div");
    			b0 = element("b");
    			t0 = text(/*current_flex*/ ctx[0]);
    			t1 = space();
    			b1 = element("b");
    			b1.textContent = "Flexion";
    			attr(b0, "id", "big-flex-number");
    			attr(b1, "id", "big-flex-sub");
    			attr(div, "class", "readout-container");
    			attr(div, "id", "live-readout-content");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, b0);
    			append(b0, t0);
    			append(div, t1);
    			append(div, b1);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*current_flex*/ 1) set_data(t0, /*current_flex*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { current_flex = 0 } = $$props;

    	$$self.$$set = $$props => {
    		if ("current_flex" in $$props) $$invalidate(0, current_flex = $$props.current_flex);
    	};

    	return [current_flex];
    }

    class Live_readout extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { current_flex: 0 });
    	}
    }

    /* src\components\workouts.svelte generated by Svelte v3.37.0 */

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (20:0) {:else}
    function create_else_block$1(ctx) {
    	let div2;
    	let h4;
    	let t1;
    	let div1;
    	let div0;
    	let if_block = !/*$workout_history*/ ctx[2].error && create_if_block_1$4(ctx);

    	return {
    		c() {
    			div2 = element("div");
    			h4 = element("h4");
    			h4.innerHTML = `<b>Your Workouts</b>`;
    			t1 = space();
    			div1 = element("div");
    			div0 = element("div");
    			if (if_block) if_block.c();
    			attr(div0, "class", "row");
    			attr(div1, "class", "workouts-card-container");
    			attr(div2, "class", "workouts-container");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, h4);
    			append(div2, t1);
    			append(div2, div1);
    			append(div1, div0);
    			if (if_block) if_block.m(div0, null);
    		},
    		p(ctx, dirty) {
    			if (!/*$workout_history*/ ctx[2].error) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$4(ctx);
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (14:0) {#if $workout_history === null || $workout_history.length == 0}
    function create_if_block$8(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<h3><b>No workouts found. Get to work! 💪</b></h3>`;
    			attr(div, "class", "readout-container");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (25:16) {#if !$workout_history.error}
    function create_if_block_1$4(ctx) {
    	let t0;
    	let br;
    	let t1;
    	let div;

    	let each_value = {
    		length: Math.min(/*$workout_history*/ ctx[2].length, 10 * /*show_more*/ ctx[0])
    	};

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	let if_block = /*show_more*/ ctx[0] * 10 < /*$workout_history*/ ctx[2].length && create_if_block_2$2(ctx);

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			br = element("br");
    			t1 = space();
    			div = element("div");
    			if (if_block) if_block.c();
    			attr(div, "class", "row center-align");
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t0, anchor);
    			insert(target, br, anchor);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$workout_history, show_more*/ 5) {
    				each_value = {
    					length: Math.min(/*$workout_history*/ ctx[2].length, 10 * /*show_more*/ ctx[0])
    				};

    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t0.parentNode, t0);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (/*show_more*/ ctx[0] * 10 < /*$workout_history*/ ctx[2].length) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2$2(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(br);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (27:20) {#each                           {length: Math.min($workout_history.length , 10 * show_more)} as _,i                      }
    function create_each_block$5(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let span;
    	let t0_value = /*$workout_history*/ ctx[2][/*i*/ ctx[6]].name + "";
    	let t0;
    	let t1;
    	let p;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			p = element("p");
    			p.textContent = "I am a very simple card. I am good at containing small bits of information.\r\n                                I am convenient because I require little markup to use effectively.";
    			attr(span, "class", "card-title");
    			attr(div0, "class", "card-content");
    			attr(div1, "class", "card teal lighten-4");
    			attr(div2, "class", "col s3 m6");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			append(div0, span);
    			append(span, t0);
    			append(div0, t1);
    			append(div0, p);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$workout_history*/ 4 && t0_value !== (t0_value = /*$workout_history*/ ctx[2][/*i*/ ctx[6]].name + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (42:24) {#if show_more * 10 < $workout_history.length }
    function create_if_block_2$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Load More";
    			attr(button, "class", " btn waves-effect waves-light");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*$workout_history*/ ctx[2] === null || /*$workout_history*/ ctx[2].length == 0) return create_if_block$8;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let $workout_history,
    		$$unsubscribe_workout_history = noop,
    		$$subscribe_workout_history = () => ($$unsubscribe_workout_history(), $$unsubscribe_workout_history = subscribe(workout_history, $$value => $$invalidate(2, $workout_history = $$value)), workout_history);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_workout_history());
    	const workout_history = writable([{}]);
    	$$subscribe_workout_history();

    	onMount(() => {
    		let data = JSON.parse(localStorage.getItem("workout_history"));
    		console.log(data);
    		workout_history.set(data);
    	});

    	let { show_more = 1 } = $$props;

    	const click_handler = () => {
    		$$invalidate(0, show_more = show_more + 1);
    	};

    	$$self.$$set = $$props => {
    		if ("show_more" in $$props) $$invalidate(0, show_more = $$props.show_more);
    	};

    	return [show_more, workout_history, $workout_history, click_handler];
    }

    class Workouts extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { workout_history: 1, show_more: 0 });
    	}

    	get workout_history() {
    		return this.$$.ctx[1];
    	}
    }

    let exercises = new Map();
    let data_arr = [
        {
            "location": "elbow",
            "name" : "Bicep Curls",
            "desc" : "Add an interesting description",
            "id" : 0,
            "editable_props" : {
                    "reps" : 10,
                    "weight" : 25
            },
            "use_flex": true,
            "start": "straight",
            "end"  : "flex"
        },
        {
            "location": "elbow",
            "name" : "Shoulder Press",
            "desc" : "Add an interesting description",
            "id" : 1,
            "editable_props" : {
                "reps" : 10,
                "weight" : 25

            },
            "use_flex": true,
            "start": "flex",
            "end"  : "straight"
        },{
            "location": "body",
            "name" : "Run",
            "desc" : "Add an interesting description",
            "id" : 2,
            "editable_props" : {
                "time" : 10,
                "distance" : 1
            },
            "use_flex": false,
            "start": "flex",
            "end"  : "straight"
        }
    ];

    data_arr.forEach(element =>{
        exercises.set(element.id, element);
    });

    /* src\components\property-editor.svelte generated by Svelte v3.37.0 */

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i][0];
    	child_ctx[4] = list[i][1];
    	child_ctx[5] = list;
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (10:4) {#if           $current_edit_workout.activities &&          $editor_target != null      }
    function create_if_block$7(ctx) {
    	let div2;
    	let div0;
    	let t1;
    	let div1;
    	let div2_intro;
    	let div2_outro;
    	let current;
    	let each_value = Object.entries(/*$current_edit_workout*/ ctx[0].activities[/*$editor_target*/ ctx[1]].editable_props);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			div0.innerHTML = `<span class="card-title">Edit Workout Properties</span>`;
    			t1 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div0, "class", "card-content white-text");
    			attr(div1, "class", "card-action white-text");
    			attr(div2, "class", "card teal svelte-sn8spe");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div2, t1);
    			append(div2, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$current_edit_workout, $editor_target, Object*/ 3) {
    				each_value = Object.entries(/*$current_edit_workout*/ ctx[0].activities[/*$editor_target*/ ctx[1]].editable_props);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div2_outro) div2_outro.end(1);
    				if (!div2_intro) div2_intro = create_in_transition(div2, fade, {});
    				div2_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div2_intro) div2_intro.invalidate();
    			div2_outro = create_out_transition(div2, fade, {});
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div2_outro) div2_outro.end();
    		}
    	};
    }

    // (19:12) {#each Object.entries($current_edit_workout.activities[$editor_target].editable_props) as [key, value]}
    function create_each_block$4(ctx) {
    	let t0_value = /*key*/ ctx[3].toUpperCase() + "";
    	let t0;
    	let t1;
    	let input;
    	let mounted;
    	let dispose;

    	function input_input_handler() {
    		/*input_input_handler*/ ctx[2].call(input, /*key*/ ctx[3]);
    	}

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = space();
    			input = element("input");
    			attr(input, "class", "white-text");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, input, anchor);
    			set_input_value(input, /*$current_edit_workout*/ ctx[0].activities[/*$editor_target*/ ctx[1]].editable_props[/*key*/ ctx[3]]);

    			if (!mounted) {
    				dispose = listen(input, "input", input_input_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*$current_edit_workout, $editor_target*/ 3 && t0_value !== (t0_value = /*key*/ ctx[3].toUpperCase() + "")) set_data(t0, t0_value);

    			if (dirty & /*$current_edit_workout, $editor_target, Object*/ 3 && input.value !== /*$current_edit_workout*/ ctx[0].activities[/*$editor_target*/ ctx[1]].editable_props[/*key*/ ctx[3]]) {
    				set_input_value(input, /*$current_edit_workout*/ ctx[0].activities[/*$editor_target*/ ctx[1]].editable_props[/*key*/ ctx[3]]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(input);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$current_edit_workout*/ ctx[0].activities && /*$editor_target*/ ctx[1] != null && create_if_block$7(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*$current_edit_workout*/ ctx[0].activities && /*$editor_target*/ ctx[1] != null) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$current_edit_workout, $editor_target*/ 3) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$7(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let $current_edit_workout;
    	let $editor_target;
    	component_subscribe($$self, current_edit_workout, $$value => $$invalidate(0, $current_edit_workout = $$value));
    	component_subscribe($$self, editor_target, $$value => $$invalidate(1, $editor_target = $$value));

    	function input_input_handler(key) {
    		$current_edit_workout.activities[$editor_target].editable_props[key] = this.value;
    		current_edit_workout.set($current_edit_workout);
    	}

    	return [$current_edit_workout, $editor_target, input_input_handler];
    }

    class Property_editor extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});
    	}
    }

    /* src\components\create-workout.svelte generated by Svelte v3.37.0 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	child_ctx[20] = i;
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[21] = list[i][0];
    	child_ctx[22] = list[i][1];
    	return child_ctx;
    }

    // (146:20) {#each [...exercises] as [key, value]}
    function create_each_block_1$1(ctx) {
    	let li;
    	let t0_value = /*value*/ ctx[22].name + "";
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[9](/*value*/ ctx[22], ...args);
    	}

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(li, "class", "collection-item exercise-listing svelte-19dcxvj");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);

    			if (!mounted) {
    				dispose = listen(li, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (167:20) {:else}
    function create_else_block(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let each_value = /*$current_edit_workout*/ ctx[0]["activities"];
    	const get_key = ctx => /*excs*/ ctx[18].key;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$3(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$3(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$current_edit_workout, startDrag, endDrag, doDrag, onDrop, editItemAtIDX*/ 61) {
    				each_value = /*$current_edit_workout*/ ctx[0]["activities"];
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, destroy_block, create_each_block$3, each_1_anchor, get_each_context$3);
    			}
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (161:20) {#if !$current_edit_workout["activities"] ||                          $current_edit_workout["activities"].length === 0                      }
    function create_if_block$6(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.textContent = "Exercises you add will appear here!";
    			attr(div, "class", "collection-item teal white-text");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (192:36) {#if excs.editable_props.reps != null}
    function create_if_block_2$1(ctx) {
    	let t0;
    	let t1_value = /*excs*/ ctx[18].editable_props.reps + "";
    	let t1;

    	return {
    		c() {
    			t0 = text("x ");
    			t1 = text(t1_value);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$current_edit_workout*/ 1 && t1_value !== (t1_value = /*excs*/ ctx[18].editable_props.reps + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (195:36) {#if excs.editable_props.weight != null}
    function create_if_block_1$3(ctx) {
    	let t0;
    	let t1_value = /*excs*/ ctx[18].editable_props.weight + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			t0 = text("(");
    			t1 = text(t1_value);
    			t2 = text(" lbs.)");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, t2, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$current_edit_workout*/ 1 && t1_value !== (t1_value = /*excs*/ ctx[18].editable_props.weight + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(t2);
    		}
    	};
    }

    // (168:24) {#each $current_edit_workout["activities"]as excs, i (excs.key)}
    function create_each_block$3(key_1, ctx) {
    	let li;
    	let t0_value = /*excs*/ ctx[18].name + "";
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;
    	let if_block0 = /*excs*/ ctx[18].editable_props.reps != null && create_if_block_2$1(ctx);
    	let if_block1 = /*excs*/ ctx[18].editable_props.weight != null && create_if_block_1$3(ctx);

    	function dragstart_handler(...args) {
    		return /*dragstart_handler*/ ctx[10](/*excs*/ ctx[18], /*i*/ ctx[20], ...args);
    	}

    	function dragend_handler(...args) {
    		return /*dragend_handler*/ ctx[11](/*excs*/ ctx[18], /*i*/ ctx[20], ...args);
    	}

    	function dragover_handler(...args) {
    		return /*dragover_handler*/ ctx[12](/*excs*/ ctx[18], /*i*/ ctx[20], ...args);
    	}

    	function drop_handler(...args) {
    		return /*drop_handler*/ ctx[13](/*excs*/ ctx[18], /*i*/ ctx[20], ...args);
    	}

    	function click_handler_1(...args) {
    		return /*click_handler_1*/ ctx[14](/*i*/ ctx[20], ...args);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			attr(li, "class", "collection-item exercise-listing svelte-19dcxvj");
    			attr(li, "draggable", "true");
    			toggle_class(li, "being-dragged", /*excs*/ ctx[18].beingDragged === true);
    			toggle_class(li, "teal", /*excs*/ ctx[18].beingEdited === true);
    			toggle_class(li, "white-text", /*excs*/ ctx[18].beingEdited === true);
    			this.first = li;
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);
    			if (if_block0) if_block0.m(li, null);
    			append(li, t2);
    			if (if_block1) if_block1.m(li, null);
    			append(li, t3);

    			if (!mounted) {
    				dispose = [
    					listen(li, "dragstart", dragstart_handler),
    					listen(li, "dragend", dragend_handler),
    					listen(li, "dragover", dragover_handler),
    					listen(li, "drop", drop_handler),
    					listen(li, "click", click_handler_1)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*$current_edit_workout*/ 1 && t0_value !== (t0_value = /*excs*/ ctx[18].name + "")) set_data(t0, t0_value);

    			if (/*excs*/ ctx[18].editable_props.reps != null) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					if_block0.m(li, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*excs*/ ctx[18].editable_props.weight != null) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1$3(ctx);
    					if_block1.c();
    					if_block1.m(li, t3);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*$current_edit_workout*/ 1) {
    				toggle_class(li, "being-dragged", /*excs*/ ctx[18].beingDragged === true);
    			}

    			if (dirty & /*$current_edit_workout*/ 1) {
    				toggle_class(li, "teal", /*excs*/ ctx[18].beingEdited === true);
    			}

    			if (dirty & /*$current_edit_workout*/ 1) {
    				toggle_class(li, "white-text", /*excs*/ ctx[18].beingEdited === true);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let div8;
    	let h4;
    	let t1;
    	let div7;
    	let div1;
    	let h6;
    	let t3;
    	let div0;
    	let input;
    	let t4;
    	let div6;
    	let div3;
    	let div2;
    	let t6;
    	let ul0;
    	let t7;
    	let div5;
    	let div4;
    	let t9;
    	let ul1;
    	let t10;
    	let propertyeditor;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_1 = [...exercises];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	function select_block_type(ctx, dirty) {
    		if (!/*$current_edit_workout*/ ctx[0]["activities"] || /*$current_edit_workout*/ ctx[0]["activities"].length === 0) return create_if_block$6;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);
    	propertyeditor = new Property_editor({});

    	return {
    		c() {
    			div8 = element("div");
    			h4 = element("h4");
    			h4.innerHTML = `<b>Edit A Routine:</b>`;
    			t1 = space();
    			div7 = element("div");
    			div1 = element("div");
    			h6 = element("h6");
    			h6.innerHTML = `<b>Name:</b>`;
    			t3 = space();
    			div0 = element("div");
    			input = element("input");
    			t4 = space();
    			div6 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			div2.innerHTML = `<b>Available Exercises:</b>`;
    			t6 = space();
    			ul0 = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			div5 = element("div");
    			div4 = element("div");
    			div4.innerHTML = `<b>Your Workout:</b>`;
    			t9 = space();
    			ul1 = element("ul");
    			if_block.c();
    			t10 = space();
    			create_component(propertyeditor.$$.fragment);
    			attr(input, "id", "name");
    			attr(input, "type", "text");
    			attr(input, "class", "input-field inline svelte-19dcxvj");
    			attr(div0, "class", "title-save-container svelte-19dcxvj");
    			attr(div1, "class", "input-field col s6");
    			attr(div2, "class", "col-header svelte-19dcxvj");
    			attr(ul0, "class", "collection");
    			attr(div3, "class", "workout-creator-col svelte-19dcxvj");
    			attr(div4, "class", "col-header svelte-19dcxvj");
    			attr(ul1, "class", "collection drag-container svelte-19dcxvj");
    			attr(div5, "class", "workout-creator-col svelte-19dcxvj");
    			attr(div6, "class", "workout-creator-cols svelte-19dcxvj");
    			attr(div7, "class", "create-workout-container svelte-19dcxvj");
    			attr(div8, "class", "workouts-container");
    		},
    		m(target, anchor) {
    			insert(target, div8, anchor);
    			append(div8, h4);
    			append(div8, t1);
    			append(div8, div7);
    			append(div7, div1);
    			append(div1, h6);
    			append(div1, t3);
    			append(div1, div0);
    			append(div0, input);
    			set_input_value(input, /*$current_edit_workout*/ ctx[0].name);
    			append(div7, t4);
    			append(div7, div6);
    			append(div6, div3);
    			append(div3, div2);
    			append(div3, t6);
    			append(div3, ul0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul0, null);
    			}

    			append(div6, t7);
    			append(div6, div5);
    			append(div5, div4);
    			append(div5, t9);
    			append(div5, ul1);
    			if_block.m(ul1, null);
    			append(div8, t10);
    			mount_component(propertyeditor, div8, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(input, "input", /*input_input_handler*/ ctx[8]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*$current_edit_workout*/ 1 && input.value !== /*$current_edit_workout*/ ctx[0].name) {
    				set_input_value(input, /*$current_edit_workout*/ ctx[0].name);
    			}

    			if (dirty & /*addExercise, exercises*/ 2) {
    				each_value_1 = [...exercises];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(ul1, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(propertyeditor.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(propertyeditor.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div8);
    			destroy_each(each_blocks, detaching);
    			if_block.d();
    			destroy_component(propertyeditor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function doDrag(e, entry, idx) {
    	e.preventDefault();
    	e.pageX; var dragY = e.pageY;
    	e.target.style.top = dragY + "px";
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let $current_edit_workout;
    	let $editor_target;
    	component_subscribe($$self, current_edit_workout, $$value => $$invalidate(0, $current_edit_workout = $$value));
    	component_subscribe($$self, editor_target, $$value => $$invalidate(16, $editor_target = $$value));
    	let { ctx } = $$props;
    	let { id } = $$props;
    	let sub;

    	beforeUpdate(() => {
    		$$invalidate(6, id = ctx.id);
    		let curr = JSON.parse(localStorage.getItem("routine_list"));
    		let workout_obj = JSON.parse(curr[id]);
    		current_edit_workout.set(workout_obj);

    		sub = current_edit_workout.subscribe(value => {
    			let curr = JSON.parse(localStorage.getItem("routine_list"));
    			curr[id] = JSON.stringify($current_edit_workout);
    			localStorage.setItem("routine_list", JSON.stringify(curr));
    		});
    	});

    	onDestroy(() => {
    		if (sub) sub();
    		set_store_value(editor_target, $editor_target = null, $editor_target);

    		if ($current_edit_workout.activities.length === 0 && $current_edit_workout.name === "My Cool Workout") {
    			let curr = JSON.parse(localStorage.getItem("routine_list"));
    			delete curr[id];
    			localStorage.setItem("routine_list", JSON.stringify(curr));
    		}
    	});

    	function addExercise(e, ex) {
    		current_edit_workout.update(curr => {
    			ex.key = Math.random();
    			let ret;
    			ret = curr;
    			ret["activities"].push(_.cloneDeep(ex));
    			return ret;
    		});
    	}

    	function startDrag(e, entry, idx) {
    		clearEditor();
    		set_store_value(current_edit_workout, $current_edit_workout.activities[idx].beingDragged = true, $current_edit_workout);

    		//Set the origin index for the transfer
    		e.dataTransfer.setData("source", idx);
    	}

    	function endDrag(e, entry, idx) {
    		e.preventDefault();
    		set_store_value(current_edit_workout, $current_edit_workout.activities[idx].beingDragged = null, $current_edit_workout);
    	}

    	function onDrop(e, entry, idx) {
    		let src = e.dataTransfer.getData("source");
    		let temp = $current_edit_workout.activities[idx];
    		set_store_value(current_edit_workout, $current_edit_workout.activities[idx] = $current_edit_workout.activities[src], $current_edit_workout);
    		set_store_value(current_edit_workout, $current_edit_workout.activities[src] = temp, $current_edit_workout);
    	}

    	function editItemAtIDX(idx) {
    		clearEditor();
    		set_store_value(current_edit_workout, $current_edit_workout.activities[idx].beingEdited = true, $current_edit_workout);
    		editor_target.set(idx);
    	}

    	function clearEditor() {
    		if ($editor_target != null) set_store_value(current_edit_workout, $current_edit_workout.activities[$editor_target].beingEdited = false, $current_edit_workout);
    	}

    	function input_input_handler() {
    		$current_edit_workout.name = this.value;
    		current_edit_workout.set($current_edit_workout);
    	}

    	const click_handler = (value, e) => addExercise(e, value);
    	const dragstart_handler = (excs, i, e) => startDrag(e, excs, i);
    	const dragend_handler = (excs, i, e) => endDrag(e, excs, i);
    	const dragover_handler = (excs, i, e) => doDrag(e);
    	const drop_handler = (excs, i, e) => onDrop(e, excs, i);
    	const click_handler_1 = (i, e) => editItemAtIDX(i);

    	$$self.$$set = $$props => {
    		if ("ctx" in $$props) $$invalidate(7, ctx = $$props.ctx);
    		if ("id" in $$props) $$invalidate(6, id = $$props.id);
    	};

    	return [
    		$current_edit_workout,
    		addExercise,
    		startDrag,
    		endDrag,
    		onDrop,
    		editItemAtIDX,
    		id,
    		ctx,
    		input_input_handler,
    		click_handler,
    		dragstart_handler,
    		dragend_handler,
    		dragover_handler,
    		drop_handler,
    		click_handler_1
    	];
    }

    class Create_workout extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { ctx: 7, id: 6 });
    	}
    }

    /* src\components\view-workouts.svelte generated by Svelte v3.37.0 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i][0];
    	child_ctx[3] = list[i][1];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	child_ctx[8] = i;
    	return child_ctx;
    }

    // (46:4) {#if workouts != null}
    function create_if_block$5(ctx) {
    	let div;
    	let each_value = Object.entries(/*workouts*/ ctx[0]).map(/*func*/ ctx[1]);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "workout-viewer row svelte-1mczv8v");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*Object, workouts, JSON, Math*/ 1) {
    				each_value = Object.entries(/*workouts*/ ctx[0]).map(/*func*/ ctx[1]);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (56:24) {#each {length: Math.min(content.activities.length, 3)} as _, i}
    function create_each_block_1(ctx) {
    	let li;
    	let t_value = /*content*/ ctx[3].activities[/*i*/ ctx[8]].name + "";
    	let t;

    	return {
    		c() {
    			li = element("li");
    			t = text(t_value);
    			attr(li, "class", "collection-item");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*workouts*/ 1 && t_value !== (t_value = /*content*/ ctx[3].activities[/*i*/ ctx[8]].name + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    		}
    	};
    }

    // (61:24) {#if content.activities.length > 3}
    function create_if_block_1$2(ctx) {
    	let li;
    	let t0;
    	let t1_value = /*content*/ ctx[3].activities.length - 3 + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			li = element("li");
    			t0 = text("...And ");
    			t1 = text(t1_value);
    			t2 = text(" More!");
    			attr(li, "class", "collection-item teal white-text");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);
    			append(li, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*workouts*/ 1 && t1_value !== (t1_value = /*content*/ ctx[3].activities.length - 3 + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    		}
    	};
    }

    // (48:8) {#each Object.entries(workouts).map(x=> [x[0],JSON.parse(x[1])]) as [key,content]}
    function create_each_block$2(ctx) {
    	let a1;
    	let div;
    	let b;
    	let t0_value = /*content*/ ctx[3].name + "";
    	let t0;
    	let t1;
    	let span;
    	let t2;
    	let t3_value = /*content*/ ctx[3].times_performed + "";
    	let t3;
    	let t4;

    	let t5_value = (/*content*/ ctx[3].times_performed === 1
    	? "Time"
    	: "Times") + "";

    	let t5;
    	let t6;
    	let ul;
    	let t7;
    	let t8;
    	let a0;
    	let t9;
    	let a0_href_value;
    	let t10;
    	let a1_href_value;

    	let each_value_1 = {
    		length: Math.min(/*content*/ ctx[3].activities.length, 3)
    	};

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let if_block = /*content*/ ctx[3].activities.length > 3 && create_if_block_1$2(ctx);

    	return {
    		c() {
    			a1 = element("a");
    			div = element("div");
    			b = element("b");
    			t0 = text(t0_value);
    			t1 = space();
    			span = element("span");
    			t2 = text("Performed ");
    			t3 = text(t3_value);
    			t4 = space();
    			t5 = text(t5_value);
    			t6 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			if (if_block) if_block.c();
    			t8 = space();
    			a0 = element("a");
    			t9 = text("Start");
    			t10 = space();
    			attr(ul, "class", "collection");
    			attr(a0, "href", a0_href_value = "./run-workout/" + /*key*/ ctx[2]);
    			attr(a0, "class", "button");
    			attr(div, "class", "svelte-1mczv8v");
    			attr(a1, "class", "workout-card z-depth-1 svelte-1mczv8v");
    			attr(a1, "href", a1_href_value = "/create-workout/" + /*key*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, a1, anchor);
    			append(a1, div);
    			append(div, b);
    			append(b, t0);
    			append(div, t1);
    			append(div, span);
    			append(span, t2);
    			append(span, t3);
    			append(span, t4);
    			append(span, t5);
    			append(div, t6);
    			append(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append(ul, t7);
    			if (if_block) if_block.m(ul, null);
    			append(div, t8);
    			append(div, a0);
    			append(a0, t9);
    			append(a1, t10);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*workouts*/ 1 && t0_value !== (t0_value = /*content*/ ctx[3].name + "")) set_data(t0, t0_value);
    			if (dirty & /*workouts*/ 1 && t3_value !== (t3_value = /*content*/ ctx[3].times_performed + "")) set_data(t3, t3_value);

    			if (dirty & /*workouts*/ 1 && t5_value !== (t5_value = (/*content*/ ctx[3].times_performed === 1
    			? "Time"
    			: "Times") + "")) set_data(t5, t5_value);

    			if (dirty & /*Object, workouts, JSON*/ 1) {
    				each_value_1 = {
    					length: Math.min(/*content*/ ctx[3].activities.length, 3)
    				};

    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, t7);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (/*content*/ ctx[3].activities.length > 3) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					if_block.m(ul, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*workouts*/ 1 && a0_href_value !== (a0_href_value = "./run-workout/" + /*key*/ ctx[2])) {
    				attr(a0, "href", a0_href_value);
    			}

    			if (dirty & /*workouts*/ 1 && a1_href_value !== (a1_href_value = "/create-workout/" + /*key*/ ctx[2])) {
    				attr(a1, "href", a1_href_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(a1);
    			destroy_each(each_blocks, detaching);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let div;
    	let h4;
    	let br;
    	let t1;
    	let if_block = /*workouts*/ ctx[0] != null && create_if_block$5(ctx);

    	return {
    		c() {
    			div = element("div");
    			h4 = element("h4");
    			h4.innerHTML = `<b>Your Routines</b>`;
    			br = element("br");
    			t1 = space();
    			if (if_block) if_block.c();
    			attr(div, "class", "workouts-container");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h4);
    			append(div, br);
    			append(div, t1);
    			if (if_block) if_block.m(div, null);
    		},
    		p(ctx, [dirty]) {
    			if (/*workouts*/ ctx[0] != null) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let workouts;

    	try {
    		workouts = JSON.parse(localStorage.getItem("routine_list"));
    	} catch(e) {
    		console.log(e);
    		workouts = null;
    	}

    	const func = x => [x[0], JSON.parse(x[1])];
    	return [workouts, func];
    }

    class View_workouts extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});
    	}
    }

    // Unique ID creation requires a high quality random # generator. In the browser we therefore
    // require the crypto API and do not support built-in fallback to lower quality random number
    // generators (like Math.random()).
    var getRandomValues;
    var rnds8 = new Uint8Array(16);
    function rng() {
      // lazy load so that environments that need to polyfill have a chance to do so
      if (!getRandomValues) {
        // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation. Also,
        // find the complete implementation of crypto (msCrypto) on IE11.
        getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto !== 'undefined' && typeof msCrypto.getRandomValues === 'function' && msCrypto.getRandomValues.bind(msCrypto);

        if (!getRandomValues) {
          throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
        }
      }

      return getRandomValues(rnds8);
    }

    var REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

    function validate(uuid) {
      return typeof uuid === 'string' && REGEX.test(uuid);
    }

    /**
     * Convert array of 16 byte values to UUID string format of the form:
     * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
     */

    var byteToHex = [];

    for (var i = 0; i < 256; ++i) {
      byteToHex.push((i + 0x100).toString(16).substr(1));
    }

    function stringify(arr) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      // Note: Be careful editing this code!  It's been tuned for performance
      // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
      var uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase(); // Consistency check for valid UUID.  If this throws, it's likely due to one
      // of the following:
      // - One or more input array values don't map to a hex octet (leading to
      // "undefined" in the uuid)
      // - Invalid input values for the RFC `version` or `variant` fields

      if (!validate(uuid)) {
        throw TypeError('Stringified UUID is invalid');
      }

      return uuid;
    }

    function v4(options, buf, offset) {
      options = options || {};
      var rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

      rnds[6] = rnds[6] & 0x0f | 0x40;
      rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

      if (buf) {
        offset = offset || 0;

        for (var i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }

        return buf;
      }

      return stringify(rnds);
    }

    /* src\components\runner\calibrate.svelte generated by Svelte v3.37.0 */

    function create_if_block_3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("All Done :)))))");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (95:52) 
    function create_if_block_2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Hold that position :)");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (93:62) 
    function create_if_block_1$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Now flex the sensor");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (91:0) {#if current_state === CALIBRATE_STATES.STRAIGHT}
    function create_if_block$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Calibrating Sensor... Hold Arm Straight");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*current_state*/ ctx[0] === /*CALIBRATE_STATES*/ ctx[1].STRAIGHT) return create_if_block$4;
    		if (/*current_state*/ ctx[0] === /*CALIBRATE_STATES*/ ctx[1].WAITING_FOR_FLEX) return create_if_block_1$1;
    		if (/*current_state*/ ctx[0] === /*CALIBRATE_STATES*/ ctx[1].FLEXED) return create_if_block_2;
    		if (/*current_state*/ ctx[0] === /*CALIBRATE_STATES*/ ctx[1].DONE) return create_if_block_3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { return_data } = $$props;
    	let { done } = $$props;
    	let sub;
    	let calib_data;

    	const CALIBRATE_STATES = {
    		"STRAIGHT": 0,
    		"WAITING_FOR_FLEX": 1,
    		"FLEXED": 2,
    		"DONE": 3
    	};

    	let current_state = CALIBRATE_STATES.STRAIGHT;

    	onMount(async () => {
    		calib_data = {};
    		$$invalidate(2, return_data = {});
    		calib_data.is_calibrating = true;
    		calib_data.average = 0;
    		calib_data.count = 0;
    		calib_data.last_val = 0;
    		calib_data.time_calibrated = 0;

    		sub = current_flex.subscribe(val => {
    			if (calib_data.is_calibrating) {
    				calib_data.last_val = val;
    				calib_data.count++;
    				calib_data.average = calib_data.average + (val - calib_data.average) / calib_data.count;
    			}
    		});

    		$$invalidate(2, return_data.straight_calib = await CalibrateSensor(), return_data);
    		console.log("Calibrated stragiht reading at", return_data.straight_calib);

    		//Wait until the user flexes the sensor
    		$$invalidate(0, current_state = CALIBRATE_STATES.WAITING_FOR_FLEX);

    		calib_data.count = 0;
    		calib_data.average = 0;
    		await waitForFlex();
    		console.log("Done checking for flex");

    		//Calibrate the flexed state
    		$$invalidate(0, current_state = CALIBRATE_STATES.FLEXED);

    		calib_data.count = 0;
    		calib_data.average = 0;
    		$$invalidate(2, return_data.flex_calib = await CalibrateSensor(), return_data);
    		console.log("Done calibrating flex at", return_data.flex_calib);

    		//Notify the user they're done and calculate the ranges
    		$$invalidate(0, current_state = CALIBRATE_STATES.DONE);

    		//Low and high are 15% away from actual calib data,
    		$$invalidate(2, return_data.low_straight = return_data.straight_calib - return_data.straight_calib * 0.15, return_data);

    		$$invalidate(2, return_data.high_straight = return_data.straight_calib + return_data.straight_calib * 0.15, return_data);
    		$$invalidate(2, return_data.low_flex = return_data.flex_calib - return_data.flex_calib * 0.15, return_data);
    		$$invalidate(2, return_data.high_flex = return_data.flex_calib + return_data.flex_calib * 0.15, return_data);
    		setTimeout(done, 2000);
    	});

    	onDestroy(() => {
    		sub();
    	});

    	function CalibrateSensor() {
    		return new Promise((resolve, reject) => {
    				setTimeout(
    					() => {
    						resolve(calib_data.average);
    					},
    					4000
    				);
    			});
    	}

    	function checkFlex(resolve, interval) {
    		if (Math.abs(return_data.straight_calib - calib_data.last_val) > 15) {
    			clearInterval(interval);
    			resolve();
    		}
    	}

    	function waitForFlex() {
    		return new Promise((resolve, reject) => {
    				const interval = setInterval(
    					() => {
    						checkFlex(resolve, interval);
    					},
    					500
    				);

    				setTimeout(
    					() => {
    						clearInterval(interval);
    						reject();
    					},
    					10000
    				);
    			});
    	}

    	$$self.$$set = $$props => {
    		if ("return_data" in $$props) $$invalidate(2, return_data = $$props.return_data);
    		if ("done" in $$props) $$invalidate(3, done = $$props.done);
    	};

    	return [current_state, CALIBRATE_STATES, return_data, done];
    }

    class Calibrate extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { return_data: 2, done: 3 });
    	}
    }

    //States that the workout runner can currently be in
    const states = {
        CALIBRATING: 0, //Calibrating the sensor
        0: "CALIBRATING", 
        RUNNING: 1, //Activity is currently running
        1: "RUNNING",
        PAUSED: 2, //Workout paused
        2: "PAUSED",
        SWITCHING: 3, //Move the flex sensor from x to y
        3: "SWITCHING",
        INIT: 4, //Put the flex sensor on your arm/wrist/leg/body
        4: "INIT"
    };

    /* src\components\runner\instructor.svelte generated by Svelte v3.37.0 */

    function create_if_block$3(ctx) {
    	let t0;
    	let br;
    	let t1;

    	return {
    		c() {
    			t0 = text("GRAPHIC here");
    			br = element("br");
    			t1 = text("\r\n    PUT THE SENSOR ON");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, br, anchor);
    			insert(target, t1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(br);
    			if (detaching) detach(t1);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let t0;
    	let br;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block = /*state*/ ctx[1] === states.INIT && create_if_block$3();

    	return {
    		c() {
    			if (if_block) if_block.c();
    			t0 = space();
    			br = element("br");
    			t1 = space();
    			button = element("button");
    			button.textContent = "Done";
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, br, anchor);
    			insert(target, t1, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", function () {
    					if (is_function(/*done*/ ctx[0]())) /*done*/ ctx[0]().apply(this, arguments);
    				});

    				mounted = true;
    			}
    		},
    		p(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (/*state*/ ctx[1] === states.INIT) {
    				if (if_block) ; else {
    					if_block = create_if_block$3();
    					if_block.c();
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(br);
    			if (detaching) detach(t1);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { done } = $$props, { state } = $$props;
    	let { return_data } = $$props;

    	$$self.$$set = $$props => {
    		if ("done" in $$props) $$invalidate(0, done = $$props.done);
    		if ("state" in $$props) $$invalidate(1, state = $$props.state);
    		if ("return_data" in $$props) $$invalidate(2, return_data = $$props.return_data);
    	};

    	return [done, state, return_data];
    }

    class Instructor extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { done: 0, state: 1, return_data: 2 });
    	}
    }

    /* src\components\runner\runner.svelte generated by Svelte v3.37.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	child_ctx[15] = i;
    	return child_ctx;
    }

    // (205:12) {#if item.reps_remaining }
    function create_if_block_1(ctx) {
    	let t0_value = /*item*/ ctx[13].reps_remaining + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = text(" left!");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*data*/ 1 && t0_value !== (t0_value = /*item*/ ctx[13].reps_remaining + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (208:12) {#if item.use_flex === false && i == 0}
    function create_if_block$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Done!";
    			attr(button, "class", "btn");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*resolveExercise*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (194:4) {#each data.workout_queue as item, i (item.key)}
    function create_each_block$1(key_1, ctx) {
    	let div;
    	let t0_value = /*item*/ ctx[13].name + "";
    	let t0;
    	let br;
    	let t1;
    	let t2;
    	let t3;
    	let div_intro;
    	let div_outro;
    	let current;
    	let if_block0 = /*item*/ ctx[13].reps_remaining && create_if_block_1(ctx);
    	let if_block1 = /*item*/ ctx[13].use_flex === false && /*i*/ ctx[15] == 0 && create_if_block$2(ctx);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			br = element("br");
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			attr(div, "class", "card queue-card svelte-ukz1a");
    			set_style(div, "z-index", -/*i*/ ctx[15]);
    			set_style(div, "transform", "matrix(" + (1 - /*i*/ ctx[15] * 0.05) + ", 0, 0, 1, 1, " + -/*i*/ ctx[15] * 5 + ")");
    			this.first = div;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, br);
    			append(div, t1);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t2);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t3);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if ((!current || dirty & /*data*/ 1) && t0_value !== (t0_value = /*item*/ ctx[13].name + "")) set_data(t0, t0_value);

    			if (/*item*/ ctx[13].reps_remaining) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(div, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*item*/ ctx[13].use_flex === false && /*i*/ ctx[15] == 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$2(ctx);
    					if_block1.c();
    					if_block1.m(div, t3);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (!current || dirty & /*data*/ 1) {
    				set_style(div, "z-index", -/*i*/ ctx[15]);
    			}

    			if (!current || dirty & /*data*/ 1) {
    				set_style(div, "transform", "matrix(" + (1 - /*i*/ ctx[15] * 0.05) + ", 0, 0, 1, 1, " + -/*i*/ ctx[15] * 5 + ")");
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);

    				if (!div_intro) div_intro = create_in_transition(div, fly, {
    					duration: 1000,
    					delay: 10 * /*i*/ ctx[15],
    					easing: elasticOut,
    					y: 100
    				});

    				div_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, /*rotateOut*/ ctx[2], {});
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (detaching && div_outro) div_outro.end();
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let button;
    	let t1;
    	let br;
    	let t2;
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*data*/ ctx[0].workout_queue;
    	const get_key = ctx => /*item*/ ctx[13].key;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Iterate";
    			t1 = space();
    			br = element("br");
    			t2 = space();
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(button, "class", "btn");
    			attr(br, "class", "out svelte-ukz1a");
    			attr(div, "class", "workouts-container queue-card-container svelte-ukz1a");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			insert(target, t1, anchor);
    			insert(target, br, anchor);
    			insert(target, t2, anchor);
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*iterateActivity*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*data, resolveExercise*/ 3) {
    				each_value = /*data*/ ctx[0].workout_queue;
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (detaching) detach(t1);
    			if (detaching) detach(br);
    			if (detaching) detach(t2);
    			if (detaching) detach(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			mounted = false;
    			dispose();
    		}
    	};
    }

    let activityIDX = 0;

    function sleep(time) {
    	return new Promise((resolve, reject) => {
    			setTimeout(resolve, time);
    		});
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $current_flex;
    	component_subscribe($$self, current_flex, $$value => $$invalidate(7, $current_flex = $$value));
    	let { data = {} } = $$props;
    	let resolve;

    	let button_promise = new Promise((_resolve, _reject) => {
    			resolve = _resolve;
    		});

    	onMount(() => {
    		//Form a new json object for local storage
    		localStorage.setItem("active_workout", JSON.stringify(data));

    		$$invalidate(0, data.workout_queue[activityIDX].active = true, data);
    		data.workout_queue.push({ "name": "Workout Finished!", "end": true });
    		$$invalidate(0, data);
    		waitForExercises();
    	});

    	function resolveExercise() {
    		resolve();
    		console.log("Resolved a workout promise");

    		button_promise = new Promise((_resolve, _reject) => {
    				resolve = _resolve;
    			});
    	}

    	//Takes a 
    	function querySensor(resolve, timout_to_clear, bounds_low, bounds_high) {
    		if ($current_flex > bounds_low && $current_flex < bounds_high) {
    			clearInterval(timout_to_clear);
    			resolve();
    		}
    	}

    	function withinThreshold(low, high) {
    		return new Promise((resolve, reject) => {
    				const interval = setInterval(
    					() => {
    						querySensor(resolve, interval, low, high);
    					},
    					100
    				);
    			});
    	}

    	function getRep() {
    		return new Promise(async (resolve, reject) => {
    				let curr = data.workout_queue[0];

    				//The exercise starts from the flexed position
    				if (curr.start === "flex") {
    					//Wait till we're within our threshold
    					await withinThreshold(data.sensor_data.low_flex, data.sensor_data.high_flex);

    					await withinThreshold(data.sensor_data.low_straight, data.sensor_data.high_straight);
    					resolve();
    				} else if (curr.start === "straight") {
    					await withinThreshold(data.sensor_data.low_straight, data.sensor_data.high_straight);
    					console.log("Within threshold for straight start");
    					await withinThreshold(data.sensor_data.low_flex, data.sensor_data.high_flex);
    					resolve();
    				}
    			});
    	}

    	function waitForFlexAcitivty() {
    		return new Promise(async (resolve, reject) => {
    				while (data.workout_queue[0].reps_remaining > 0) {
    					await getRep();
    					$$invalidate(0, data.workout_queue[0].reps_remaining--, data);
    				}

    				console.log("Done with this exercise");
    				resolve();
    			});
    	}

    	async function waitForExercises() {
    		while (data.workout_queue.length > 0) {
    			if (data.workout_queue[0].use_flex === true) {
    				if (data.workout_queue[0].editable_props.reps != null) {
    					$$invalidate(0, data.workout_queue[0].reps_remaining = data.workout_queue[0].editable_props.reps, data);
    				}

    				await waitForFlexAcitivty();
    				console.log("Going to next exercise from completion");
    			} else if (data.workout_queue[0].use_flex === false) {
    				await button_promise;
    				console.log("Going to next exercise from button");
    			} else //End card
    			if (data.workout_queue[0].end === true) {
    				//TODO: Setup history logging
    				await sleep(2000);

    				page.redirect("/workouts");
    			}

    			data.workout_queue.shift();
    			$$invalidate(0, data);
    			console.log(data.workout_queue);
    			await sleep(500);
    		}
    	}

    	function rotateOut(node, { delay = 0, duration = 250 }) {
    		return {
    			delay,
    			duration,
    			css: t => {
    				const eased = cubicOut(t);

    				return `
                opacity: ${eased};
                transform: rotate(${(1 - eased) * -10}deg);
                `;
    			}
    		};
    	}

    	function iterateActivity() {
    		console.log([...data.workout_queue]);
    		$$invalidate(0, data.workout_queue = [...data.workout_queue.slice(1)], data);
    		console.log([...data.workout_queue]);
    	} // let elem = document.querySelector(".queue-card-container").firstElementChild
    	// elem.classList.add("out")

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(0, data = $$props.data);
    	};

    	return [data, resolveExercise, rotateOut, iterateActivity];
    }

    class Runner extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { data: 0 });
    	}
    }

    /* src\components\workout-runner.svelte generated by Svelte v3.37.0 */

    function create_fragment$2(ctx) {
    	let div;
    	let switch_instance;
    	let updating_data;
    	let updating_return_data;
    	let current;

    	function switch_instance_data_binding(value) {
    		/*switch_instance_data_binding*/ ctx[10](value);
    	}

    	function switch_instance_return_data_binding(value) {
    		/*switch_instance_return_data_binding*/ ctx[11](value);
    	}

    	var switch_value = /*$current_component*/ ctx[3];

    	function switch_props(ctx) {
    		let switch_instance_props = {
    			done: /*finishState*/ ctx[8],
    			state: /*$current_state*/ ctx[2]
    		};

    		if (/*$component_data*/ ctx[1] !== void 0) {
    			switch_instance_props.data = /*$component_data*/ ctx[1];
    		}

    		if (/*$return_data*/ ctx[4] !== void 0) {
    			switch_instance_props.return_data = /*$return_data*/ ctx[4];
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props(ctx));
    		binding_callbacks.push(() => bind(switch_instance, "data", switch_instance_data_binding));
    		binding_callbacks.push(() => bind(switch_instance, "return_data", switch_instance_return_data_binding));
    	}

    	return {
    		c() {
    			div = element("div");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const switch_instance_changes = {};
    			if (dirty & /*$current_state*/ 4) switch_instance_changes.state = /*$current_state*/ ctx[2];

    			if (!updating_data && dirty & /*$component_data*/ 2) {
    				updating_data = true;
    				switch_instance_changes.data = /*$component_data*/ ctx[1];
    				add_flush_callback(() => updating_data = false);
    			}

    			if (!updating_return_data && dirty & /*$return_data*/ 16) {
    				updating_return_data = true;
    				switch_instance_changes.return_data = /*$return_data*/ ctx[4];
    				add_flush_callback(() => updating_return_data = false);
    			}

    			if (switch_value !== (switch_value = /*$current_component*/ ctx[3])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					binding_callbacks.push(() => bind(switch_instance, "data", switch_instance_data_binding));
    					binding_callbacks.push(() => bind(switch_instance, "return_data", switch_instance_return_data_binding));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, div, null);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (switch_instance) destroy_component(switch_instance);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $component_data;
    	let $current_state;
    	let $current_component;

    	let $return_data,
    		$$unsubscribe_return_data = noop,
    		$$subscribe_return_data = () => ($$unsubscribe_return_data(), $$unsubscribe_return_data = subscribe(return_data, $$value => $$invalidate(4, $return_data = $$value)), return_data);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_return_data());
    	let { ctx } = $$props;

    	//The current state of this workout-runner
    	let current_state = writable(states.INIT);

    	component_subscribe($$self, current_state, value => $$invalidate(2, $current_state = value));

    	//The current rendered component
    	let current_component = writable();

    	component_subscribe($$self, current_component, value => $$invalidate(3, $current_component = value));

    	//Data sent into each component
    	let component_data = writable({});

    	component_subscribe($$self, component_data, value => $$invalidate(1, $component_data = value));
    	let { return_data = writable() } = $$props;
    	$$subscribe_return_data();

    	//Get the workout by ID and load it into active workout
    	onMount(() => {
    		//First check if we have an active workout
    		//This allows us to persist workouts throughout refreshes
    		let curr = JSON.parse(localStorage.getItem("active_workout"));

    		if (curr != null) {
    			set_store_value(component_data, $component_data.active_workout = curr.active_workout, $component_data);
    			set_store_value(component_data, $component_data.workout_queue = [...curr.workout_queue], $component_data);
    			set_store_value(component_data, $component_data.sensor_data = curr.sensor_data, $component_data);
    			set_store_value(component_data, $component_data.id = curr.id, $component_data);
    		}

    		if ($component_data.id != ctx.id) {
    			curr = JSON.parse(localStorage.getItem("routine_list"));
    			console.log("Starting new workout at ID:", ctx.id);
    			let workout = JSON.parse(curr[ctx.id]);
    			set_store_value(component_data, $component_data.active_workout = workout, $component_data);
    			set_store_value(component_data, $component_data.workout_queue = workout.activities, $component_data);
    			set_store_value(component_data, $component_data.id = ctx.id, $component_data);

    			//Update the current workout to indicate we've performed it
    			set_store_value(component_data, $component_data.active_workout.times_performed++, $component_data);

    			curr[ctx.id] = JSON.stringify($component_data.active_workout);
    			localStorage.setItem("routine_list", JSON.stringify(curr));
    		} else {
    			set_store_value(current_state, $current_state = states.RUNNING, $current_state);
    			set_store_value(current_component, $current_component = Runner, $current_component);
    		}
    	});

    	switch ($current_state) {
    		case states.SWITCHING:
    			set_store_value(current_component, $current_component = Instructor, $current_component);
    			break;
    		case states.CALIBRATING:
    			set_store_value(current_component, $current_component = Calibrate, $current_component);
    			break;
    		case states.INIT:
    			set_store_value(current_component, $current_component = Instructor, $current_component);
    	}

    	//Called by a state component when it has finished doing its thing
    	function finishState() {
    		console.log("Finished step:", states[$current_state]);
    		console.log("Returned state:", $return_data);

    		switch ($current_state) {
    			case states.INIT:
    				set_store_value(current_state, $current_state = states.CALIBRATING, $current_state);
    				set_store_value(current_component, $current_component = Calibrate, $current_component);
    				break;
    			case states.CALIBRATING:
    				set_store_value(component_data, $component_data.sensor_data = $return_data, $component_data);
    				set_store_value(current_state, $current_state = states.RUNNING, $current_state);
    				set_store_value(current_component, $current_component = Runner, $current_component);
    				break;
    		}

    		$$subscribe_return_data($$invalidate(0, return_data = new writable()));
    	}

    	function switch_instance_data_binding(value) {
    		$component_data = value;
    		component_data.set($component_data);
    	}

    	function switch_instance_return_data_binding(value) {
    		$return_data = value;
    		return_data.set($return_data);
    	}

    	$$self.$$set = $$props => {
    		if ("ctx" in $$props) $$invalidate(9, ctx = $$props.ctx);
    		if ("return_data" in $$props) $$subscribe_return_data($$invalidate(0, return_data = $$props.return_data));
    	};

    	return [
    		return_data,
    		$component_data,
    		$current_state,
    		$current_component,
    		$return_data,
    		current_state,
    		current_component,
    		component_data,
    		finishState,
    		ctx,
    		switch_instance_data_binding,
    		switch_instance_return_data_binding
    	];
    }

    class Workout_runner extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { ctx: 9, return_data: 0 });
    	}
    }

    const workout_template = {
        "name" : "My Cool Workout",
        "activities" : [],
        "times_performed": 0
    };

    /* src\router.svelte generated by Svelte v3.37.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (112:4) {#if route.show != false}
    function create_if_block$1(ctx) {
    	let routeritem;
    	let current;

    	routeritem = new Router_item({
    			props: {
    				active: /*route*/ ctx[6].path == /*$current_route*/ ctx[2].path,
    				path: /*route*/ ctx[6].path,
    				label: /*route*/ ctx[6].label,
    				icon: /*route*/ ctx[6].icon
    			}
    		});

    	return {
    		c() {
    			create_component(routeritem.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(routeritem, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const routeritem_changes = {};
    			if (dirty & /*$current_route*/ 4) routeritem_changes.active = /*route*/ ctx[6].path == /*$current_route*/ ctx[2].path;
    			routeritem.$set(routeritem_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(routeritem.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(routeritem.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(routeritem, detaching);
    		}
    	};
    }

    // (111:4) {#each routes as route}
    function create_each_block(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*route*/ ctx[6].show != false && create_if_block$1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*route*/ ctx[6].show != false) if_block.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let t1;
    	let ul;
    	let current;
    	let each_value = /*routes*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<b>Wearable Fitness Tracker</b>`;
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div, "class", "brand teal lighten-1 white-text");
    			attr(ul, "class", "collection");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			insert(target, t1, anchor);
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*routes, $current_route*/ 12) {
    				each_value = /*routes*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching) detach(t1);
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $current_route,
    		$$unsubscribe_current_route = noop,
    		$$subscribe_current_route = () => ($$unsubscribe_current_route(), $$unsubscribe_current_route = subscribe(current_route, $$value => $$invalidate(2, $current_route = $$value)), current_route);

    	let $route_ctx,
    		$$unsubscribe_route_ctx = noop,
    		$$subscribe_route_ctx = () => ($$unsubscribe_route_ctx(), $$unsubscribe_route_ctx = subscribe(route_ctx, $$value => $$invalidate(4, $route_ctx = $$value)), route_ctx);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_route());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_route_ctx());

    	const routes = [
    		{
    			"path": "/",
    			"label": "Home",
    			"icon": "home",
    			"component": Live_readout,
    			"show": true
    		},
    		{
    			"path": "/workouts",
    			"label": "Workout History",
    			"icon": "fitness_center",
    			"component": Workouts,
    			"show": true
    		},
    		{
    			"path": "/settings",
    			"label": "Settings",
    			"icon": "settings",
    			"component": Live_readout,
    			"show": true
    		},
    		{
    			"path": "/live-readout",
    			"label": "Live Readout",
    			"icon": "whatshot",
    			"component": Live_readout,
    			"show": true
    		},
    		{
    			"path": "/create-workout",
    			"label": "Create a Routine",
    			"icon": "add",
    			"component": Create_workout,
    			"middlewares": [createWorkout],
    			"show": true
    		},
    		{
    			"path": "/create-workout/:id",
    			"component": Create_workout,
    			"show": false
    		},
    		{
    			"path": "/run-workout/:id",
    			"component": Workout_runner,
    			"show": false
    		},
    		{
    			"path": "/view-routines",
    			"label": "View/Start Routines",
    			"icon": "view_headline",
    			"component": View_workouts,
    			"show": true
    		}
    	];

    	function createWorkout(ctx, next) {
    		localStorage.clear("active_workout");
    		let id = v4();
    		ctx.id = id;
    		let curr = JSON.parse(localStorage.getItem("routine_list"));

    		if (!curr) {
    			curr = {};
    		}

    		curr[id] = JSON.stringify(workout_template);
    		localStorage.setItem("routine_list", JSON.stringify(curr));
    		page.redirect("/create-workout/" + id);
    	}

    	let { current_route = routes[0] } = $$props;
    	$$subscribe_current_route();
    	let { route_ctx = {} } = $$props;
    	$$subscribe_route_ctx();
    	page.base("");

    	routes.forEach(element => {
    		if (element.middlewares) {
    			page(element.path, ...element.middlewares, (ctx, next) => {
    				set_store_value(current_route, $current_route = element, $current_route);
    				set_store_value(route_ctx, $route_ctx = ctx.params, $route_ctx);
    			});
    		} else {
    			page(element.path, ctx => {
    				set_store_value(current_route, $current_route = element, $current_route);
    				set_store_value(route_ctx, $route_ctx = ctx.params, $route_ctx);
    			});
    		}
    	});

    	page();

    	$$self.$$set = $$props => {
    		if ("current_route" in $$props) $$subscribe_current_route($$invalidate(0, current_route = $$props.current_route));
    		if ("route_ctx" in $$props) $$subscribe_route_ctx($$invalidate(1, route_ctx = $$props.route_ctx));
    	};

    	return [current_route, route_ctx, $current_route, routes];
    }

    class Router extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { current_route: 0, route_ctx: 1 });
    	}
    }

    /* src\app.svelte generated by Svelte v3.37.0 */

    function create_if_block(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*$current_route*/ ctx[3].component;

    	function switch_props(ctx) {
    		return {
    			props: {
    				current_flex: /*$current_flex*/ ctx[2],
    				ctx: /*$route_ctx*/ ctx[4]
    			}
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props(ctx));
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = {};
    			if (dirty & /*$current_flex*/ 4) switch_instance_changes.current_flex = /*$current_flex*/ ctx[2];
    			if (dirty & /*$route_ctx*/ 16) switch_instance_changes.ctx = /*$route_ctx*/ ctx[4];

    			if (switch_value !== (switch_value = /*$current_route*/ ctx[3].component)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let body;
    	let div2;
    	let div0;
    	let router;
    	let updating_current_route;
    	let updating_route_ctx;
    	let t;
    	let div1;
    	let current;

    	function router_current_route_binding(value) {
    		/*router_current_route_binding*/ ctx[5](value);
    	}

    	function router_route_ctx_binding(value) {
    		/*router_route_ctx_binding*/ ctx[6](value);
    	}

    	let router_props = {};

    	if (/*current_route*/ ctx[0] !== void 0) {
    		router_props.current_route = /*current_route*/ ctx[0];
    	}

    	if (/*route_ctx*/ ctx[1] !== void 0) {
    		router_props.route_ctx = /*route_ctx*/ ctx[1];
    	}

    	router = new Router({ props: router_props });
    	binding_callbacks.push(() => bind(router, "current_route", router_current_route_binding));
    	binding_callbacks.push(() => bind(router, "route_ctx", router_route_ctx_binding));
    	let if_block = /*current_route*/ ctx[0] != undefined && create_if_block(ctx);

    	return {
    		c() {
    			body = element("body");
    			div2 = element("div");
    			div0 = element("div");
    			create_component(router.$$.fragment);
    			t = space();
    			div1 = element("div");
    			if (if_block) if_block.c();
    			attr(div0, "class", "sidebar z-depth-1");
    			attr(div1, "class", "content grey lighten-5");
    			attr(div2, "class", "content-container");
    		},
    		m(target, anchor) {
    			insert(target, body, anchor);
    			append(body, div2);
    			append(div2, div0);
    			mount_component(router, div0, null);
    			append(div2, t);
    			append(div2, div1);
    			if (if_block) if_block.m(div1, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const router_changes = {};

    			if (!updating_current_route && dirty & /*current_route*/ 1) {
    				updating_current_route = true;
    				router_changes.current_route = /*current_route*/ ctx[0];
    				add_flush_callback(() => updating_current_route = false);
    			}

    			if (!updating_route_ctx && dirty & /*route_ctx*/ 2) {
    				updating_route_ctx = true;
    				router_changes.route_ctx = /*route_ctx*/ ctx[1];
    				add_flush_callback(() => updating_route_ctx = false);
    			}

    			router.$set(router_changes);

    			if (/*current_route*/ ctx[0] != undefined) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*current_route*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(router.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(body);
    			destroy_component(router);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $current_flex;

    	let $current_route,
    		$$unsubscribe_current_route = noop,
    		$$subscribe_current_route = () => ($$unsubscribe_current_route(), $$unsubscribe_current_route = subscribe(current_route, $$value => $$invalidate(3, $current_route = $$value)), current_route);

    	let $route_ctx,
    		$$unsubscribe_route_ctx = noop,
    		$$subscribe_route_ctx = () => ($$unsubscribe_route_ctx(), $$unsubscribe_route_ctx = subscribe(route_ctx, $$value => $$invalidate(4, $route_ctx = $$value)), route_ctx);

    	component_subscribe($$self, current_flex, $$value => $$invalidate(2, $current_flex = $$value));
    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_route());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_route_ctx());
    	let { current_route = writable({}) } = $$props; //Maintained in global scope 
    	$$subscribe_current_route();
    	let { route_ctx = writable({}) } = $$props;
    	$$subscribe_route_ctx();
    	let socket = new WebSocket("ws://localhost:3000");

    	socket.onmessage = event => {
    		set_store_value(current_flex, $current_flex = event.data, $current_flex);
    	};

    	function router_current_route_binding(value) {
    		current_route = value;
    		$$subscribe_current_route($$invalidate(0, current_route));
    	}

    	function router_route_ctx_binding(value) {
    		route_ctx = value;
    		$$subscribe_route_ctx($$invalidate(1, route_ctx));
    	}

    	$$self.$$set = $$props => {
    		if ("current_route" in $$props) $$subscribe_current_route($$invalidate(0, current_route = $$props.current_route));
    		if ("route_ctx" in $$props) $$subscribe_route_ctx($$invalidate(1, route_ctx = $$props.route_ctx));
    	};

    	return [
    		current_route,
    		route_ctx,
    		$current_flex,
    		$current_route,
    		$route_ctx,
    		router_current_route_binding,
    		router_route_ctx_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { current_route: 0, route_ctx: 1 });
    	}
    }

    const app = new App({
        target: document.body,
        props: {
            name: 'world'
        }
    });

    return app;

}());
