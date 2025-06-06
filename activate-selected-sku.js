
<script>
  document.addEventListener("DOMContentLoaded", function () {
    const params = new URLSearchParams(window.location.search);
    const selectedSku = params.get("selected-sku");
    if (!selectedSku) return;

    // Für Magento Bundle- oder konfigurierbare Produkte:
    const skuOptions = document.querySelectorAll('[data-product-sku]');
    skuOptions.forEach(option => {
      if (option.dataset.productSku === selectedSku) {
        // Falls es ein Radio/Checkbox ist – auswählen
        if (option.type === "radio" || option.type === "checkbox") {
          option.checked = true;
        }

        // Falls es ein Select (Dropdown) ist – aktivieren
        const select = option.closest('select');
        if (select) {
          select.value = option.value;
          select.dispatchEvent(new Event('change'));
        }

        // Falls Magento-JS benötigt – Trigger manuell
        option.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
</script>
