var app = (function () {
    'use strict';

    function noop() { }
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
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
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
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
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
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
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

    /* src\router-item.svelte generated by Svelte v3.37.0 */

    function create_fragment$4(ctx) {
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

    function instance$4($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { path: 0, active: 1, icon: 2, label: 3 });
    	}
    }

    /* src\components\live-readout.svelte generated by Svelte v3.37.0 */

    function create_fragment$3(ctx) {
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

    function instance$3($$self, $$props, $$invalidate) {
    	let { current_flex = 0 } = $$props;

    	$$self.$$set = $$props => {
    		if ("current_flex" in $$props) $$invalidate(0, current_flex = $$props.current_flex);
    	};

    	return [current_flex];
    }

    class Live_readout extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { current_flex: 0 });
    	}
    }

    /* src\components\workouts.svelte generated by Svelte v3.37.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (20:0) {:else}
    function create_else_block(ctx) {
    	let div2;
    	let h4;
    	let t1;
    	let div1;
    	let div0;
    	let if_block = !/*$workout_history*/ ctx[2].error && create_if_block_1(ctx);

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
    					if_block = create_if_block_1(ctx);
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

    // (14:0) {#if workout_history === null}
    function create_if_block$1(ctx) {
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
    function create_if_block_1(ctx) {
    	let t;
    	let div;

    	let each_value = {
    		length: Math.min(/*$workout_history*/ ctx[2].length, 10 * /*show_more*/ ctx[0])
    	};

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let if_block = /*show_more*/ ctx[0] * 10 && create_if_block_2(ctx);

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			div = element("div");
    			if (if_block) if_block.c();
    			attr(div, "class", "row center-align");
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t, anchor);
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
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t.parentNode, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (/*show_more*/ ctx[0] * 10) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2(ctx);
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
    			if (detaching) detach(t);
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (27:20) {#each                           {length: Math.min($workout_history.length, 10 * show_more)} as _,i                      }
    function create_each_block$1(ctx) {
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

    // (41:24) {#if show_more * 10 }
    function create_if_block_2(ctx) {
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

    function create_fragment$2(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*workout_history*/ ctx[1] === null) return create_if_block$1;
    		return create_else_block;
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
    			if_block.p(ctx, dirty);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { workout_history: 1, show_more: 0 });
    	}

    	get workout_history() {
    		return this.$$.ctx[1];
    	}
    }

    /* src\router.svelte generated by Svelte v3.37.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (46:4) {#each routes as route}
    function create_each_block(ctx) {
    	let routeritem;
    	let current;

    	routeritem = new Router_item({
    			props: {
    				active: /*route*/ ctx[3].path == /*$current_route*/ ctx[1].path,
    				path: /*route*/ ctx[3].path,
    				label: /*route*/ ctx[3].label,
    				icon: /*route*/ ctx[3].icon
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
    			if (dirty & /*$current_route*/ 2) routeritem_changes.active = /*route*/ ctx[3].path == /*$current_route*/ ctx[1].path;
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

    function create_fragment$1(ctx) {
    	let div;
    	let t1;
    	let ul;
    	let current;
    	let each_value = /*routes*/ ctx[2];
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
    			if (dirty & /*routes, $current_route*/ 6) {
    				each_value = /*routes*/ ctx[2];
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
    		$$subscribe_current_route = () => ($$unsubscribe_current_route(), $$unsubscribe_current_route = subscribe(current_route, $$value => $$invalidate(1, $current_route = $$value)), current_route);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_route());

    	const routes = [
    		{
    			"path": "/",
    			"label": "Home",
    			"icon": "home",
    			"component": Live_readout
    		},
    		{
    			"path": "/workouts",
    			"label": "Workouts",
    			"icon": "fitness_center",
    			"component": Workouts
    		},
    		{
    			"path": "/settings",
    			"label": "Settings",
    			"icon": "settings",
    			"component": Live_readout
    		},
    		{
    			"path": "/live-readout",
    			"label": "Live Readout",
    			"icon": "whatshot",
    			"component": Live_readout
    		}
    	];

    	let { current_route = routes[0] } = $$props;
    	$$subscribe_current_route();
    	page.base("");

    	routes.forEach(element => {
    		page(element.path, () => {
    			set_store_value(current_route, $current_route = element, $current_route);
    		});
    	});

    	page();

    	$$self.$$set = $$props => {
    		if ("current_route" in $$props) $$subscribe_current_route($$invalidate(0, current_route = $$props.current_route));
    	};

    	return [current_route, $current_route, routes];
    }

    class Router extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { current_route: 0 });
    	}
    }

    /* src\app.svelte generated by Svelte v3.37.0 */

    function create_if_block(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*$current_route*/ ctx[2].component;

    	function switch_props(ctx) {
    		return {
    			props: { current_flex: /*$current_flex*/ ctx[3] }
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
    			if (dirty & /*$current_flex*/ 8) switch_instance_changes.current_flex = /*$current_flex*/ ctx[3];

    			if (switch_value !== (switch_value = /*$current_route*/ ctx[2].component)) {
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
    	let t;
    	let div1;
    	let current;

    	function router_current_route_binding(value) {
    		/*router_current_route_binding*/ ctx[4](value);
    	}

    	let router_props = {};

    	if (/*current_route*/ ctx[0] !== void 0) {
    		router_props.current_route = /*current_route*/ ctx[0];
    	}

    	router = new Router({ props: router_props });
    	binding_callbacks.push(() => bind(router, "current_route", router_current_route_binding));
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
    	let $current_route,
    		$$unsubscribe_current_route = noop,
    		$$subscribe_current_route = () => ($$unsubscribe_current_route(), $$unsubscribe_current_route = subscribe(current_route, $$value => $$invalidate(2, $current_route = $$value)), current_route);

    	let $current_flex,
    		$$unsubscribe_current_flex = noop,
    		$$subscribe_current_flex = () => ($$unsubscribe_current_flex(), $$unsubscribe_current_flex = subscribe(current_flex, $$value => $$invalidate(3, $current_flex = $$value)), current_flex);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_route());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_current_flex());
    	let { current_route = writable({}) } = $$props; //Maintained in global scope 
    	$$subscribe_current_route();
    	let { current_flex = writable(0) } = $$props;
    	$$subscribe_current_flex();
    	let socket = new WebSocket("ws://localhost:3000");

    	socket.onmessage = event => {
    		$$subscribe_current_flex($$invalidate(1, current_flex = event.data));
    	};

    	function router_current_route_binding(value) {
    		current_route = value;
    		$$subscribe_current_route($$invalidate(0, current_route));
    	}

    	$$self.$$set = $$props => {
    		if ("current_route" in $$props) $$subscribe_current_route($$invalidate(0, current_route = $$props.current_route));
    		if ("current_flex" in $$props) $$subscribe_current_flex($$invalidate(1, current_flex = $$props.current_flex));
    	};

    	return [
    		current_route,
    		current_flex,
    		$current_route,
    		$current_flex,
    		router_current_route_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { current_route: 0, current_flex: 1 });
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
