<script>
    export let current_flex = 0;
	import { fade } from 'svelte/transition';

</script>
<div class = "readout-container" id = "live-readout-content">
    <b id = "big-flex-number">
        {current_flex}
    </b>
    <b id = "big-flex-sub">Flexion</b>
</div>