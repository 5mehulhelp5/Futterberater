<?php
namespace Cytracon\Futterberater\Block;

use Magento\Framework\View\Element\Template;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory;
use Magento\Catalog\Model\ProductRepository;
use Magento\Catalog\Model\ProductFactory;
use Magento\Bundle\Model\ResourceModel\Selection as BundleSelection;
use Magento\Bundle\Model\Product\Type as BundleProductType;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Framework\App\CacheInterface;

class Index extends Template
{
    protected $collectionFactory;
    protected $productRepository;
    protected $productFactory;
    protected $bundleSelection;
    protected $bundleProductType;
    protected $imageHelper;
    protected $storeManager;
    protected $eavConfig;
    protected $cache;

    public function __construct(
        Template\Context $context,
        CollectionFactory $collectionFactory,
        ProductRepository $productRepository,
        ProductFactory $productFactory,
        BundleSelection $bundleSelection,
        BundleProductType $bundleProductType,
        ImageHelper $imageHelper,
        StoreManagerInterface $storeManager,
        EavConfig $eavConfig,
        CacheInterface $cache,
        array $data = []
    ) {
        $this->collectionFactory = $collectionFactory;
        $this->productRepository = $productRepository;
        $this->productFactory = $productFactory;
        $this->bundleSelection = $bundleSelection;
        $this->bundleProductType = $bundleProductType;
        $this->imageHelper = $imageHelper;
        $this->storeManager = $storeManager;
        $this->eavConfig = $eavConfig;
        $this->cache = $cache;
        parent::__construct($context, $data);
    }

    public function getParsedProducts()
    {
        $cacheKey = 'cytracon_futterberater_products_' . $this->storeManager->getStore()->getId();
        $cachedProducts = $this->cache->load($cacheKey);

        if ($cachedProducts !== false) {
            return unserialize($cachedProducts);
        }

        $products = [];
        $parentCache = [];

        try {
            // Attributoptionen für futterempfehlung laden
            $attribute = $this->eavConfig->getAttribute('catalog_product', 'futterempfehlung');
            $options = $attribute->getSource()->getAllOptions();
            $optionMap = [];
            foreach ($options as $option) {
                if (!empty($option['value']) && !empty($option['label'])) {
                    $optionMap[$option['value']] = $option['label'];
                }
            }

            $validFutterempfehlungen = [
                'variante_hund_nass_1',
                'variante_hund_trocken_1',
                'variante_hund_trocken_2',
                'variante_katze_1'
            ];

            $collection = $this->collectionFactory->create();
            $collection->addAttributeToSelect(['name', 'sku', 'futterempfehlung', 'price_kg', 'weight']);
            $collection->addFieldToFilter('futterempfehlung', ['notnull' => true]);

            foreach ($collection as $product) {
                $sku = $product->getSku();
                $name = $product->getName();
                $futterempfehlungId = $product->getData('futterempfehlung');

                if (empty($sku) || empty($name) || empty($futterempfehlungId)) {
                    continue;
                }

                // Option ID in Varianten-ID übersetzen
                $futterempfehlung = isset($optionMap[$futterempfehlungId]) ? $optionMap[$futterempfehlungId] : null;
                if (empty($futterempfehlung)) {
                    continue;
                }
                if (!in_array($futterempfehlung, $validFutterempfehlungen)) {
                    continue;
                }

                $priceKg = $product->getData('price_kg');
                if (!is_numeric($priceKg) || $priceKg <= 0) {
                    continue;
                }

                $weight = $product->getWeight();
                if (!is_numeric($weight) || $weight <= 0) {
                    continue;
                }

                // Nur Bundle-Elternprodukte berücksichtigen
                $parentIds = $this->bundleSelection->getParentIdsByChild($product->getId());
                if (empty($parentIds)) {
                    continue;
                }

                $parentId = reset($parentIds);

                if (!isset($parentCache[$parentId])) {
                    $parentCache[$parentId] = $this->productFactory->create()->load($parentId);
                }

                $parent = $parentCache[$parentId];
                if ($parent->getTypeId() !== 'bundle') {
                    continue;
                }

                $categories = $parent->getCategoryIds();
                if (!array_intersect([6, 7, 58], $categories)) {
                    continue;
                }

                $imageUrl = $this->imageHelper->init($parent, 'product_base_image')->getUrl();
                if (!$imageUrl) {
                    continue;
                }

                $urlKey = $parent->getUrlKey();
                if (empty($urlKey)) {
                    $urlKey = 'missing-url-key-' . $parentId;
                }

                // Bundle-Option-ID ermitteln
                $bundleOptionId = null;
                $bundleOptionAttributeId = null;
                $typeInstance = $this->bundleProductType;
                $options = $typeInstance->getOptionsCollection($parent);
                foreach ($options as $option) {
                    $selections = $typeInstance->getSelectionsCollection([$option->getOptionId()], $parent);
                    foreach ($selections as $selection) {
                        if ($selection->getSku() === $sku) {
                            $bundleOptionId = $selection->getSelectionId();
                            $bundleOptionAttributeId = $option->getOptionId();
                            break 2;
                        }
                    }
                }

                if (!$bundleOptionId || !$bundleOptionAttributeId) {
                    continue;
                }

                $products[] = [
                    'name' => $name,
                    'sku' => $sku,
                    'price_kg' => (float)$priceKg,
                    'parent_url_key' => $urlKey,
                    'parent_image_url' => $imageUrl,
                    'parent_categories' => $categories,
                    'weight' => (float)$weight,
                    'futterempfehlung' => $futterempfehlung,
                    'bundle_option_id' => $bundleOptionId,
                    'bundle_option_attribute_id' => $bundleOptionAttributeId
                ];
            }

            // Cache die Ergebnisse für 1 Stunde
            $this->cache->save(serialize($products), $cacheKey, ['futterberater_products'], 3600);
        } catch (\Exception $e) {
            // Fehler ignorieren, um die Ausführung fortzusetzen
        }

        return $products;
    }
}