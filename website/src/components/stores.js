import { writable } from 'svelte/store'

export const current_edit_workout = writable({})
export const editor_target = writable(null);
export const sensor_data = writable({})
export const current_flex = writable(0);
