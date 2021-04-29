<script>
    export let path, active, icon, label;
</script>
<a href = {path}>
    <li class ="collection-item" class:active="{active === true}" id = "home-button">
        <span class="material-icons">
            {icon}
        </span>
        {label}
    </li>
</a>