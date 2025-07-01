// Log-Eintrag zur Überprüfung der Dateiversion
console.log("futterberater-logic.js geladen, Erstellungsdatum: 30. April 2025, 20:00 UTC");

// Debounce-Funktion für Eingaben
const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

// Filtert Produkte basierend auf Benutzereingaben
function filterProducts(products, tierart, weight, geschmackInputs, relevantCategories) {
    const allowedFlavors = Array.from(geschmackInputs).map(input => input.value.toLowerCase());
    const filtered = products
        .filter(product => {
            // Basisdaten validieren
            if (!product.name || !product.sku || !product.futterempfehlung) {
                return false;
            }

            const categories = product.parent_categories ? product.parent_categories.map(c => parseInt(c)) : [];
            if (!categories.some(c => relevantCategories.includes(c))) {
                return false;
            }

            if (tierart === "hund") {
                const alter = document.getElementById("altersgruppe")?.value;
                const vorliebe = document.getElementById("futtervorliebe")?.value;
                const isPuppy = product.name.toLowerCase().includes("puppy") || product.name.toLowerCase().includes("mini puppy");

                if (alter === "welpe" && !isPuppy) {
                    return false;
                }
                if (alter === "erwachsen" && isPuppy) {
                    return false;
                }
                if (vorliebe === "trocken" && !categories.includes(6)) {
                    return false;
                }
                if (vorliebe === "nass" && !categories.includes(7)) {
                    return false;
                }
                if (vorliebe === "beides" && !categories.includes(6) && !categories.includes(7)) {
                    return false;
                }

                const productName = product.name.toLowerCase();
                const allFlavors = ['beef', 'chicken', 'lamb', 'iberico', 'fish', 'turkey', 'duck', 'salmon'];
                const productFlavors = allFlavors.filter(flavor => productName.includes(flavor));
                if (productFlavors.length > 0 && !productFlavors.every(flavor => allowedFlavors.includes(flavor))) {
                    return false;
                }
            }

            let futterData;
            const futterempfehlungVariante = product.futterempfehlung;
            if (futterempfehlungVariante && futterEmpfehlungen[futterempfehlungVariante]) {
                futterData = futterEmpfehlungen[futterempfehlungVariante];
            } else {
                const fallbackVariante = tierart === "hund" ? "variante_hund_nass_1" : "variante_katze_1";
                if (!futterEmpfehlungen[fallbackVariante]) {
                    return false;
                }
                futterData = futterEmpfehlungen[fallbackVariante];
            }

            const priceKg = parseFloat(product.price_kg);
            if (!isFinite(priceKg) || priceKg <= 0) {
                return false;
            }

            const entry = futterData.find(e => e.weight >= weight);
            if (!entry || !entry.recommendation || !isFinite(entry.recommendation)) {
                return false;
            }

            const factor = parseFloat(document.getElementById("activity")?.value) || 1;
            if (!isFinite(factor)) {
                return false;
            }

            const daily = entry.recommendation * factor;
            const monthly = daily * 30 / 1000;
            if (!isFinite(monthly)) {
                return false;
            }

            const productWeight = parseFloat(product.weight || "1");
            if (!isFinite(productWeight) || productWeight <= 0) {
                return false;
            }

            const anzahlProdukteProMonat = parseFloat((monthly / productWeight).toFixed(2));
            const cost = parseFloat((monthly * priceKg).toFixed(2));

            if (!isFinite(anzahlProdukteProMonat) || !isFinite(cost)) {
                return false;
            }

            // Modifiziere das Produkt-Objekt direkt
            product.monthly = monthly;
            product.anzahlProdukteProMonat = anzahlProdukteProMonat;
            product.cost = cost;
            return true;
        });

    return filtered;
}

// Gruppiert Produkte nach Elternprodukt
function groupProducts(filteredProducts) {
    const groupedProducts = {};
    filteredProducts.forEach(product => {
        const parentKey = product.parent_url_key || product.sku || 'unknown';
        if (!groupedProducts[parentKey]) {
            groupedProducts[parentKey] = [];
        }
        // Explizite Kopie aller relevanten Eigenschaften
        const copiedProduct = {
            name: product.name,
            sku: product.sku,
            parent_url_key: product.parent_url_key,
            parent_image_url: product.parent_image_url,
            price_kg: parseFloat(product.price_kg) || 0,
            weight: parseFloat(product.weight) || 1,
            futterempfehlung: product.futterempfehlung,
            parent_categories: Array.isArray(product.parent_categories) ? product.parent_categories.slice() : [],
            monthly: parseFloat(product.monthly) || 0,
            anzahlProdukteProMonat: parseFloat(product.anzahlProdukteProMonat) || 0,
            cost: parseFloat(product.cost) || 0,
            bundle_option_id: product.bundle_option_id,
            bundle_option_attribute_id: product.bundle_option_attribute_id
        };
        groupedProducts[parentKey].push(copiedProduct);
    });
    return groupedProducts;
}

// Wählt die besten Produkte aus jeder Gruppe
function selectFinalProducts(groupedProducts) {
    const finalProducts = [];
    for (const parentKey in groupedProducts) {
        const childProducts = groupedProducts[parentKey];
        if (childProducts.length === 1) {
            finalProducts.push({ ...childProducts[0] });
        } else {
            const eligibleProducts = childProducts.filter(p => p.anzahlProdukteProMonat <= 1);
            if (eligibleProducts.length > 0) {
                eligibleProducts.sort((a, b) => Math.abs(1 - a.anzahlProdukteProMonat) - Math.abs(1 - b.anzahlProdukteProMonat));
                finalProducts.push({ ...eligibleProducts[0] });
            } else {
                childProducts.sort((a, b) => a.anzahlProdukteProMonat - b.anzahlProdukteProMonat);
                finalProducts.push({ ...childProducts[0] });
            }
        }
    }
    const sortedProducts = finalProducts.sort((a, b) => parseFloat(a.cost) - parseFloat(b.cost));
    return sortedProducts;
}

// Hauptfunktion für die Berechnung
window.calculateFeed = function () {
    try {
        const loader = document.getElementById("loading-indicator");
        const container = document.getElementById("result-container");
        if (loader && container) {
            loader.style.display = "block";
            container.style.opacity = 0;
        }

        const tierart = document.getElementById("tierart")?.value;
        const weight = parseFloat(document.getElementById("weight")?.value);
        const weightError = document.getElementById("weight-error");
        const activity = document.getElementById("activity");
        const resultContainer = document.getElementById("futter-result");

        if (!tierart || !isFinite(weight) || weight <= 0 || !activity || !activity.value || !isFinite(parseFloat(activity.value)) || !resultContainer) {
            if (weightError) weightError.style.display = "block";
            return;
        }
        if (weightError) weightError.style.display = "none";

        const relevantCategories = tierart === 'hund' ? [6, 7] : [58];
        resultContainer.innerHTML = "";

        if (loader) loader.style.display = "none";
        if (container) container.style.opacity = 1;

        const geschmackInputs = document.querySelectorAll('input[name="geschmack"]:checked');

        if (!products || !Array.isArray(products) || products.length === 0) {
            resultContainer.innerHTML = '<p class="error-message">Keine Produkte gefunden. Bitte überprüfen Sie den Produktkatalog.</p>';
            return;
        }

        const filteredProducts = filterProducts(products, tierart, weight, geschmackInputs, relevantCategories);

        if (filteredProducts.length === 0) {
            resultContainer.innerHTML = '<p class="error-message">Keine passenden Produkte gefunden.</p>';
            return;
        }

        const groupedProducts = groupProducts(filteredProducts);
        const finalProducts = selectFinalProducts(groupedProducts);

        if (finalProducts.length === 0) {
            resultContainer.innerHTML = '<p class="error-message">Keine passenden Produkte gefunden.</p>';
            return;
        }

        finalProducts.forEach(product => {
            if (!product || !isFinite(product.monthly) || !isFinite(product.anzahlProdukteProMonat) || !isFinite(product.cost)) {
                return;
            }
            const imageUrl = product.parent_image_url || '/pub/media/catalog/product/placeholder/default/placeholder.jpg';
            const el = document.createElement("div");
            el.className = "result-box";
            el.innerHTML = `
                <a href="/${product.parent_url_key}?bundle_option[${product.bundle_option_attribute_id}]=${product.bundle_option_id}" style="text-decoration: none; color: inherit;" tabindex="0">
                    <img src="${imageUrl}" loading="lazy" style="width: 100%; height: auto; border-radius: 0.5em; margin-bottom: 0.5em;" alt="${product.name}" />
                    <strong>${product.name}</strong><br />
                    Gewicht: ${parseFloat(product.weight || "0").toFixed(2)} kg<br />
                    Bedarf/Monat: ${parseFloat(product.monthly || 0).toFixed(2)} kg<br />
                    Futter/Tag: ${parseFloat((product.monthly || 0) * 1000 / 30).toFixed(2)} g<br />
                    Anzahl Produkte pro Monat: ${parseFloat(product.anzahlProdukteProMonat || 0).toFixed(2)}<br />
                    Kosten: CHF ${parseFloat(product.cost || 0).toFixed(2)}<br />
                </a>
            `;
            resultContainer.appendChild(el);
        });
    } catch (error) {
        const resultContainer = document.getElementById("futter-result");
        if (resultContainer) {
            resultContainer.innerHTML = '<p class="error-message">Ein Fehler ist aufgetreten. Bitte versuche es später erneut.</p>';
        }
    }
};

// Event-Listener
document.addEventListener("DOMContentLoaded", function () {
    try {
        const tierart = document.getElementById("tierart");
        const hundOptionen = document.getElementById("hund-optionen");
        const altersgruppe = document.getElementById("altersgruppe");
        const futtervorliebe = document.getElementById("futtervorliebe");
        const weight = document.getElementById("weight");
        const activity = document.getElementById("activity");
        const geschmackInputs = document.querySelectorAll('input[name="geschmack"]');

        if (!tierart || !hundOptionen || !altersgruppe || !futtervorliebe || !weight || !activity) {
            throw new Error("Ein oder mehrere Formularelemente fehlen");
        }

        function updateOptionen() {
            if (tierart.value === "hund") {
                hundOptionen.style.display = "block";
            } else {
                hundOptionen.style.display = "none";
            }
            const weightValue = parseFloat(weight.value);
            const activityValue = parseFloat(activity.value);
            if (weight.value && activity.value && isFinite(weightValue) && weightValue > 0 && isFinite(activityValue)) {
                window.calculateFeed();
            }
        }

        tierart.addEventListener("change", updateOptionen);
        altersgruppe.addEventListener("change", window.calculateFeed);
        futtervorliebe.addEventListener("change", window.calculateFeed);
        weight.addEventListener("input", debounce(window.calculateFeed, 300));
        activity.addEventListener("change", window.calculateFeed);
        geschmackInputs.forEach(input => {
            input.addEventListener("change", window.calculateFeed);
        });

        setTimeout(updateOptionen, 1500);
    } catch (error) {
        // Fehler ignorieren, um die Ausführung fortzusetzen
    }
});