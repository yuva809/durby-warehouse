import type {
  ActivityEvent,
  Driver,
  InventoryMap,
  Location,
  Product,
  StockRequest,
  Transfer,
} from '../types'
import { WAREHOUSE_ID } from '../types'

// ---------------------------------------------------------------------------
// Demo data for Asia Might — one central warehouse supplying 5 Berlin
// locations. Product identity (name, brand, pack, category, expiry) and
// warehouse starting stock are taken from the customer's own inventory
// workbook ("Asia Might — Inventory Master", Overall Stock sheet). Branch-level
// on-hand quantities are not tracked in that workbook (it tracks weekly
// orders against one shared warehouse pool, not per-location stock), so
// those figures are a demo scenario built on real products — see the
// per-branch comments below for exactly which numbers are constructed.
// ---------------------------------------------------------------------------

export const LOCATIONS: Location[] = [
  { id: WAREHOUSE_ID, name: 'Central Warehouse', type: 'warehouse' },
  { id: 'b1', name: 'Kurfürstenstraße 33', shortName: 'Kurfürsten 33', city: 'Berlin', type: 'branch' },
  { id: 'b2', name: 'Hagelberger Straße 57', shortName: 'Hagelberger 57', city: 'Berlin', type: 'branch' },
  { id: 'b3', name: 'Rudower Straße 132', shortName: 'Rudower 132', city: 'Berlin', type: 'branch' },
  { id: 'b4', name: 'Wilhelmstraße 2', shortName: 'Wilhelm 2', city: 'Berlin', type: 'branch' },
  { id: 'b5', name: 'Kollwitzstraße 93', shortName: 'Kollwitz 93', city: 'Berlin', type: 'branch' },
]

export const DRIVERS: Driver[] = [
  { id: 'd1', name: 'Mike' },
  { id: 'd2', name: 'John' },
]

// 47 real products selected from the customer's Overall Stock sheet, spanning
// their actual category mix (Rice, Pulses & Lentils, Spices & Seasonings,
// Snacks, Beverages, Dairy Products, Oils and Ghee, Packaged Foods, African
// Items, Powder Items, Atta, Fish and Seafood). Name, brand, pack, unit,
// category and expiry are copied as-is. `sku` is a Durby-assigned reference
// (category prefix + the row's original S.No. from the workbook, kept in
// `sourceRef`) since most rows have no standalone article/barcode number —
// only a minority of unrelated rows in the source use a numeric code there.
// `unitPrice` and `minStock` are not in the source workbook and are
// reasonable demo estimates.
export const PRODUCTS: Product[] = [
  { id: 'ponni_boiled_rice_224', name: 'Ponni Boiled Rice', sku: 'RICE-224', category: 'Rice', brand: 'Anjappar', pack: '2 x 10kg', unit: 'Pieces', minStock: 4, unitPrice: 17.69, expiryDate: '2028-05-30', sourceRef: 'S.No. 224' },
  { id: 'premium_basmati_rice_245', name: 'Premium Basmati Rice', sku: 'RICE-245', category: 'Rice', brand: 'Hasina', pack: '5kg', unit: 'Bags', minStock: 14, unitPrice: 13.76, expiryDate: '2028-04-30', sourceRef: 'S.No. 245' },
  { id: 'matta_rice_220', name: 'Matta Rice', sku: 'RICE-220', category: 'Rice', brand: 'Ajmi', pack: '10kg', unit: 'Bags', minStock: 42, unitPrice: 15.36, sourceRef: 'S.No. 220' },
  { id: 'basmati_rice_222', name: 'Basmati Rice', sku: 'RICE-222', category: 'Rice', brand: 'Akash', pack: '10kg', unit: 'Bags', minStock: 21, unitPrice: 15.03, sourceRef: 'S.No. 222' },
  { id: 'sona_masoori_rice_226', name: 'Sona Masoori Rice', sku: 'RICE-226', category: 'Rice', brand: 'Anjappar', pack: '10kg', unit: 'Pieces', minStock: 30, unitPrice: 18.31, sourceRef: 'S.No. 226' },
  { id: 'extra_long_basmati_rice_248', name: 'Extra Long Basmati Rice', sku: 'RICE-248', category: 'Rice', brand: 'Heer', pack: '5kg', unit: 'Bags', minStock: 28, unitPrice: 17.93, sourceRef: 'S.No. 248' },
  { id: 'golden_sella_basmati_rice_228', name: 'Golden Sella Basmati Rice', sku: 'RICE-228', category: 'Rice', brand: 'Annam', pack: '5kg', unit: 'Boxes', minStock: 19, unitPrice: 19.31, sourceRef: 'S.No. 228' },
  { id: 'black_eye_beans_188', name: 'Black Eye Beans', sku: 'PULS-188', category: 'Pulses and Lentils', brand: 'Schani', pack: '10x1kg', unit: 'Box', minStock: 9, unitPrice: 11.5, expiryDate: '2028-04-30', sourceRef: 'S.No. 188' },
  { id: 'chana_dal_190', name: 'Chana Dal', sku: 'PULS-190', category: 'Pulses and Lentils', brand: 'Schani', pack: '10x1kg', unit: 'Box', minStock: 5, unitPrice: 13.24, expiryDate: '2028-05-31', sourceRef: 'S.No. 190' },
  { id: 'chickpeas_192', name: 'Chickpeas', sku: 'PULS-192', category: 'Pulses and Lentils', brand: 'Schani', pack: '6x2kg', unit: 'Box', minStock: 2, unitPrice: 11.2, expiryDate: '2028-04-30', sourceRef: 'S.No. 192' },
  { id: 'urid_whole_gota_215', name: 'Urid Whole Gota', sku: 'PULS-215', category: 'Pulses and Lentils', brand: 'Udhaiyam', pack: '10x2kg', unit: 'Box', minStock: 19, unitPrice: 12.19, expiryDate: '2028-02-28', sourceRef: 'S.No. 215' },
  { id: 'adzuki_red_kidney_beans_218', name: 'Adzuki Red Kidney Beans', sku: 'PULS-218', category: 'Pulses and Lentils', brand: 'VDS', pack: '6x900g', unit: 'Box', minStock: 2, unitPrice: 13.68, expiryDate: '2028-05-31', sourceRef: 'S.No. 218' },
  { id: 'chilli_powder_323', name: 'Chilli Powder', sku: 'SPI-323', category: 'Spices and Seasonings', brand: 'Schani', pack: '10x400g', unit: 'Box', minStock: 2, unitPrice: 13.77, expiryDate: '2027-08-31', sourceRef: 'S.No. 323' },
  { id: 'chilli_crushed_321', name: 'Chilli Crushed', sku: 'SPI-321', category: 'Spices and Seasonings', brand: 'Schani', pack: '10x250g', unit: 'Box', minStock: 2, unitPrice: 14.87, expiryDate: '2027-06-30', sourceRef: 'S.No. 321' },
  { id: 'cumin_seeds_329', name: 'Cumin Seeds', sku: 'SPI-329', category: 'Spices and Seasonings', brand: 'Schani', pack: '10x400g', unit: 'Box', minStock: 2, unitPrice: 17.76, expiryDate: '2027-09-30', sourceRef: 'S.No. 329' },
  { id: 'turmeric_powder_345', name: 'Turmeric Powder', sku: 'SPI-345', category: 'Spices and Seasonings', brand: 'Schani', pack: '10x400g', unit: 'Box', minStock: 2, unitPrice: 17.09, expiryDate: '2027-08-31', sourceRef: 'S.No. 345' },
  { id: 'jeera_whole_339', name: 'Jeera Whole', sku: 'SPI-339', category: 'Spices and Seasonings', brand: 'Schani', pack: '10x400g', unit: 'Box', minStock: 2, unitPrice: 15.01, expiryDate: '2028-12-31', sourceRef: 'S.No. 339' },
  { id: 'papadam_276', name: 'Papadam', sku: 'SNK-276', category: 'Snacks', brand: 'Annam', pack: '100x150g', unit: 'Box', minStock: 2, unitPrice: 10.86, expiryDate: '2028-11-30', sourceRef: 'S.No. 276' },
  { id: 'lollipop_277', name: 'Lollipop', sku: 'SNK-277', category: 'Snacks', brand: 'Bon Bon Bum', pack: '100 units', unit: 'Box', minStock: 2, unitPrice: 11.74, expiryDate: '2028-02-29', sourceRef: 'S.No. 277' },
  { id: 'salted_plantain_chips_281', name: 'Salted Plantain Chips', sku: 'SNK-281', category: 'Snacks', brand: 'Ecuador Tropical Gourmet', pack: '85g', unit: 'Box', minStock: 7, unitPrice: 8.53, expiryDate: '2027-04-30', sourceRef: 'S.No. 281' },
  { id: 'naughty_tomato_289', name: 'Naughty Tomato', sku: 'SNK-289', category: 'Snacks', brand: 'Kurkure', pack: '75x150g', unit: 'Box', minStock: 2, unitPrice: 11.72, expiryDate: '2027-01-31', sourceRef: 'S.No. 289' },
  { id: 'guinness_79', name: 'Guinness', sku: 'BEV-079', category: 'Beverages', brand: 'Malta', pack: '24x330ml', unit: 'Pieces', minStock: 8, unitPrice: 16.94, expiryDate: '2027-03-23', sourceRef: 'S.No. 79' },
  { id: 'black_tea_82', name: 'Black Tea', sku: 'BEV-082', category: 'Beverages', brand: 'PG Tips', pack: '12x116g', unit: 'Box', minStock: 5, unitPrice: 14.79, expiryDate: '2027-04-30', sourceRef: 'S.No. 82' },
  { id: 'danedar_tea_85', name: 'Danedar Tea', sku: 'BEV-085', category: 'Beverages', brand: 'Tapal', pack: '15x450g', unit: 'Box', minStock: 2, unitPrice: 13.68, expiryDate: '2027-05-31', sourceRef: 'S.No. 85' },
  { id: 'premium_leaf_tea_78', name: 'Premium Leaf Tea', sku: 'BEV-078', category: 'Beverages', brand: 'Fresh Tropical', pack: '6x1kg', unit: 'Box', minStock: 2, unitPrice: 18.49, expiryDate: '2027-03-12', sourceRef: 'S.No. 78' },
  { id: 'coconut_milk_powder_87', name: 'Coconut Milk Powder', sku: 'DAI-087', category: 'Dairy Products', brand: 'Maggi', pack: '12x1kg', unit: 'Box', minStock: 2, unitPrice: 13.78, expiryDate: '2027-05-31', sourceRef: 'S.No. 87' },
  { id: 'cerelac_powder_88', name: 'Cerelac Powder', sku: 'DAI-088', category: 'Dairy Products', brand: 'Nestlé', pack: '12x1kg', unit: 'Box', minStock: 2, unitPrice: 12.42, expiryDate: '2027-04-30', sourceRef: 'S.No. 88' },
  { id: 'condensed_milk_90', name: 'Condensed Milk', sku: 'DAI-090', category: 'Dairy Products', brand: 'Nestlé', pack: '48x397g', unit: 'Box', minStock: 2, unitPrice: 12.44, expiryDate: '2028-01-31', sourceRef: 'S.No. 90' },
  { id: 'nido_milk_powder_92', name: 'Nido Milk Powder', sku: 'DAI-092', category: 'Dairy Products', brand: 'Nestlé', pack: '12x900g', unit: 'Box', minStock: 2, unitPrice: 16.65, expiryDate: '2028-03-31', sourceRef: 'S.No. 92' },
  { id: 'pure_red_palm_oil_111', name: 'Pure Red Palm Oil', sku: 'OIL-111', category: 'Oils and Ghee', brand: 'Ghana Heritage', pack: '8x2L', unit: 'Box', minStock: 2, unitPrice: 19.65, expiryDate: '2028-06-30', sourceRef: 'S.No. 111' },
  { id: 'sesame_oil_112', name: 'Sesame Oil', sku: 'OIL-112', category: 'Oils and Ghee', brand: 'Idhayam', pack: '12x1L', unit: 'Box', minStock: 2, unitPrice: 21.11, expiryDate: '2027-11-30', sourceRef: 'S.No. 112' },
  { id: 'ghee_115', name: 'Ghee', sku: 'OIL-115', category: 'Oils and Ghee', brand: 'Khanum', pack: '12x1kg', unit: 'Box', minStock: 4, unitPrice: 20.55, sourceRef: 'S.No. 115' },
  { id: 'palm_oil_105', name: 'Palm Oil', sku: 'OIL-105', category: 'Oils and Ghee', brand: 'AFP', pack: '12x1L', unit: 'Box', minStock: 2, unitPrice: 19.16, expiryDate: '2028-12-31', sourceRef: 'S.No. 105' },
  { id: 'peanut_butter_122', name: 'Peanut Butter', sku: 'PKG-122', category: 'Packaged Foods', brand: 'AFP', pack: '12x500g', unit: 'Box', minStock: 2, unitPrice: 14.87, expiryDate: '2027-09-24', sourceRef: 'S.No. 122' },
  { id: 'mixed_pickle_124', name: 'Mixed Pickle', sku: 'PKG-124', category: 'Packaged Foods', brand: 'Ahmed', pack: '6x1kg', unit: 'Box', minStock: 2, unitPrice: 12.02, expiryDate: '2028-04-30', sourceRef: 'S.No. 124' },
  { id: 'jack_mackerel_125', name: 'Jack Mackerel', sku: 'PKG-125', category: 'Packaged Foods', brand: 'Alibaba', pack: '425/280g', unit: 'Box', minStock: 2, unitPrice: 12.85, expiryDate: '2029-03-31', sourceRef: 'S.No. 125' },
  { id: 'pineapple_158', name: 'Pineapple', sku: 'PKG-158', category: 'Packaged Foods', brand: 'Tropical Sun', pack: '12x(12x28ml)', unit: 'Stück', minStock: 2, unitPrice: 14.18, expiryDate: '2028-02-29', sourceRef: 'S.No. 158' },
  { id: 'gari_white_8', name: 'Gari White', sku: 'AFR-008', category: 'African Items', brand: 'AFP', pack: '16x500g', unit: 'Box', minStock: 2, unitPrice: 14.27, expiryDate: '2028-04-30', sourceRef: 'S.No. 8' },
  { id: 'plantain_fufu_12', name: 'Plantain Fufu', sku: 'AFR-012', category: 'African Items', brand: 'AFP', pack: '12x700g', unit: 'Box', minStock: 2, unitPrice: 15.53, expiryDate: '2028-04-30', sourceRef: 'S.No. 12' },
  { id: 'black_eye_beans_5', name: 'Black Eye Beans', sku: 'AFR-005', category: 'African Items', brand: 'AFP', pack: '3x4kg', unit: 'Box', minStock: 2, unitPrice: 14.05, expiryDate: '2028-04-30', sourceRef: 'S.No. 5' },
  { id: 'ginger_old_jamaica_2', name: 'Ginger Old Jamaica', sku: 'AFR-002', category: 'African Items', pack: '330ml', unit: 'Box', minStock: 9, unitPrice: 14.71, expiryDate: '2028-11-10', sourceRef: 'S.No. 2' },
  { id: 'maida_flour_172', name: 'Maida Flour', sku: 'PWD-172', category: 'Powder Items', brand: 'Annam', pack: '20x1kg', unit: 'Box', minStock: 2, unitPrice: 9.55, expiryDate: '2028-06-30', sourceRef: 'S.No. 172' },
  { id: 'rock_salt_177', name: 'Rock Salt', sku: 'PWD-177', category: 'Powder Items', brand: 'Annam', pack: '24x500g', unit: 'Box', minStock: 2, unitPrice: 10.35, expiryDate: '2028-11-30', sourceRef: 'S.No. 177' },
  { id: 'roasted_rava_176', name: 'Roasted Rava', sku: 'PWD-176', category: 'Powder Items', brand: 'Annam', pack: '20x1kg', unit: 'Box', minStock: 2, unitPrice: 10.62, expiryDate: '2029-02-28', sourceRef: 'S.No. 176' },
  { id: 'wheat_flour_76', name: 'Wheat Flour', sku: 'ATTA-076', category: 'Atta', brand: 'Ashirvad', pack: '2x10kg', unit: 'Bags', minStock: 28, unitPrice: 14.99, expiryDate: '2027-01-31', sourceRef: 'S.No. 76' },
  { id: 'wheat_flour_77', name: 'Wheat Flour', sku: 'ATTA-077', category: 'Atta', brand: 'Ashirvad', pack: '4x5kg', unit: 'Bags', minStock: 21, unitPrice: 16.03, expiryDate: '2027-03-31', sourceRef: 'S.No. 77' },
  { id: 'dry_fish_95', name: 'Dry Fish', sku: 'FISH-095', category: 'Fish and Seafood', brand: 'Samuthiram', pack: '33x150g', unit: 'Box', minStock: 2, unitPrice: 21.37, expiryDate: '2027-10-31', sourceRef: 'S.No. 95' },
]

// locationId -> productId -> quantity
//
// Warehouse row = the workbook's real "Starting Stock" for each product.
// Branch rows are a demo scenario (the source workbook tracks weekly orders
// against the shared warehouse pool, not independent branch stock): Wilhelmstraße 2
// (b4) is deliberately set up short on Ponni Boiled Rice, Coconut Milk Powder,
// Pure Red Palm Oil, Cumin Seeds and Turmeric Powder for the live walkthrough —
// all five are products Wilhelmstraße 2 genuinely over-ordered against
// warehouse availability in the real sheet this week. Rudower Straße 132 (b3)
// and Kollwitzstraße 93 (b5) each run one real product short for variety;
// Kurfürstenstraße 33 (b1) and Hagelberger Straße 57 (b2) are healthy.
export const INITIAL_INVENTORY: InventoryMap = {
  warehouse: {
    ponni_boiled_rice_224: 11, premium_basmati_rice_245: 40, matta_rice_220: 120, basmati_rice_222: 60, sona_masoori_rice_226: 86, extra_long_basmati_rice_248: 80,
    golden_sella_basmati_rice_228: 55, black_eye_beans_188: 26, chana_dal_190: 13, chickpeas_192: 3, urid_whole_gota_215: 54, adzuki_red_kidney_beans_218: 2,
    chilli_powder_323: 1, chilli_crushed_321: 3, cumin_seeds_329: 2, turmeric_powder_345: 2, jeera_whole_339: 2, papadam_276: 1,
    lollipop_277: 2, salted_plantain_chips_281: 21, naughty_tomato_289: 2, guinness_79: 24, black_tea_82: 14, danedar_tea_85: 3,
    premium_leaf_tea_78: 1, coconut_milk_powder_87: 2, cerelac_powder_88: 2, condensed_milk_90: 3, nido_milk_powder_92: 3, pure_red_palm_oil_111: 1,
    sesame_oil_112: 6, ghee_115: 11, palm_oil_105: 4, peanut_butter_122: 5, mixed_pickle_124: 3, jack_mackerel_125: 1,
    pineapple_158: 5, gari_white_8: 1, plantain_fufu_12: 2, black_eye_beans_5: 1, ginger_old_jamaica_2: 25, maida_flour_172: 5,
    rock_salt_177: 1, roasted_rava_176: 3, wheat_flour_76: 79, wheat_flour_77: 60, dry_fish_95: 2,
  },
  b1: {
    ponni_boiled_rice_224: 6, premium_basmati_rice_245: 26, matta_rice_220: 56, basmati_rice_222: 45, sona_masoori_rice_226: 56, extra_long_basmati_rice_248: 45,
    golden_sella_basmati_rice_228: 28, black_eye_beans_188: 12, chana_dal_190: 8, chickpeas_192: 4, urid_whole_gota_215: 39, adzuki_red_kidney_beans_218: 4,
    chilli_powder_323: 4, chilli_crushed_321: 3, cumin_seeds_329: 4, turmeric_powder_345: 3, jeera_whole_339: 4, papadam_276: 4,
    lollipop_277: 3, salted_plantain_chips_281: 12, naughty_tomato_289: 3, guinness_79: 18, black_tea_82: 9, danedar_tea_85: 3,
    premium_leaf_tea_78: 4, coconut_milk_powder_87: 4, cerelac_powder_88: 3, condensed_milk_90: 3, nido_milk_powder_92: 3, pure_red_palm_oil_111: 3,
    sesame_oil_112: 3, ghee_115: 6, palm_oil_105: 3, peanut_butter_122: 4, mixed_pickle_124: 4, jack_mackerel_125: 4,
    pineapple_158: 5, gari_white_8: 3, plantain_fufu_12: 3, black_eye_beans_5: 4, ginger_old_jamaica_2: 14, maida_flour_172: 4,
    rock_salt_177: 4, roasted_rava_176: 3, wheat_flour_76: 47, wheat_flour_77: 30, dry_fish_95: 4,
  },
  b2: {
    ponni_boiled_rice_224: 6, premium_basmati_rice_245: 23, matta_rice_220: 73, basmati_rice_222: 30, sona_masoori_rice_226: 51, extra_long_basmati_rice_248: 40,
    golden_sella_basmati_rice_228: 36, black_eye_beans_188: 12, chana_dal_190: 9, chickpeas_192: 3, urid_whole_gota_215: 30, adzuki_red_kidney_beans_218: 3,
    chilli_powder_323: 4, chilli_crushed_321: 4, cumin_seeds_329: 4, turmeric_powder_345: 4, jeera_whole_339: 3, papadam_276: 3,
    lollipop_277: 3, salted_plantain_chips_281: 13, naughty_tomato_289: 3, guinness_79: 12, black_tea_82: 9, danedar_tea_85: 4,
    premium_leaf_tea_78: 4, coconut_milk_powder_87: 4, cerelac_powder_88: 4, condensed_milk_90: 3, nido_milk_powder_92: 3, pure_red_palm_oil_111: 3,
    sesame_oil_112: 4, ghee_115: 6, palm_oil_105: 3, peanut_butter_122: 3, mixed_pickle_124: 3, jack_mackerel_125: 4,
    pineapple_158: 4, gari_white_8: 4, plantain_fufu_12: 3, black_eye_beans_5: 5, ginger_old_jamaica_2: 13, maida_flour_172: 4,
    rock_salt_177: 4, roasted_rava_176: 4, wheat_flour_76: 48, wheat_flour_77: 30, dry_fish_95: 5,
  },
  b3: {
    ponni_boiled_rice_224: 8, premium_basmati_rice_245: 19, matta_rice_220: 58, basmati_rice_222: 32, sona_masoori_rice_226: 68, extra_long_basmati_rice_248: 40,
    golden_sella_basmati_rice_228: 37, black_eye_beans_188: 14, chana_dal_190: 9, chickpeas_192: 4, urid_whole_gota_215: 43, adzuki_red_kidney_beans_218: 1,
    chilli_powder_323: 0, chilli_crushed_321: 4, cumin_seeds_329: 4, turmeric_powder_345: 4, jeera_whole_339: 3, papadam_276: 3,
    lollipop_277: 3, salted_plantain_chips_281: 15, naughty_tomato_289: 3, guinness_79: 12, black_tea_82: 8, danedar_tea_85: 5,
    premium_leaf_tea_78: 3, coconut_milk_powder_87: 3, cerelac_powder_88: 3, condensed_milk_90: 3, nido_milk_powder_92: 3, pure_red_palm_oil_111: 3,
    sesame_oil_112: 5, ghee_115: 7, palm_oil_105: 5, peanut_butter_122: 4, mixed_pickle_124: 3, jack_mackerel_125: 3,
    pineapple_158: 4, gari_white_8: 3, plantain_fufu_12: 4, black_eye_beans_5: 5, ginger_old_jamaica_2: 14, maida_flour_172: 4,
    rock_salt_177: 4, roasted_rava_176: 3, wheat_flour_76: 63, wheat_flour_77: 46, dry_fish_95: 4,
  },
  b4: {
    ponni_boiled_rice_224: 1, premium_basmati_rice_245: 18, matta_rice_220: 58, basmati_rice_222: 40, sona_masoori_rice_226: 40, extra_long_basmati_rice_248: 45,
    golden_sella_basmati_rice_228: 32, black_eye_beans_188: 18, chana_dal_190: 8, chickpeas_192: 4, urid_whole_gota_215: 27, adzuki_red_kidney_beans_218: 4,
    chilli_powder_323: 4, chilli_crushed_321: 4, cumin_seeds_329: 0, turmeric_powder_345: 1, jeera_whole_339: 4, papadam_276: 3,
    lollipop_277: 4, salted_plantain_chips_281: 15, naughty_tomato_289: 4, guinness_79: 12, black_tea_82: 7, danedar_tea_85: 4,
    premium_leaf_tea_78: 4, coconut_milk_powder_87: 0, cerelac_powder_88: 3, condensed_milk_90: 3, nido_milk_powder_92: 4, pure_red_palm_oil_111: 0,
    sesame_oil_112: 4, ghee_115: 6, palm_oil_105: 4, peanut_butter_122: 5, mixed_pickle_124: 3, jack_mackerel_125: 3,
    pineapple_158: 4, gari_white_8: 3, plantain_fufu_12: 5, black_eye_beans_5: 3, ginger_old_jamaica_2: 17, maida_flour_172: 4,
    rock_salt_177: 4, roasted_rava_176: 4, wheat_flour_76: 57, wheat_flour_77: 44, dry_fish_95: 3,
  },
  b5: {
    ponni_boiled_rice_224: 5, premium_basmati_rice_245: 25, matta_rice_220: 72, basmati_rice_222: 47, sona_masoori_rice_226: 65, extra_long_basmati_rice_248: 59,
    golden_sella_basmati_rice_228: 35, black_eye_beans_188: 16, chana_dal_190: 10, chickpeas_192: 4, urid_whole_gota_215: 33, adzuki_red_kidney_beans_218: 3,
    chilli_powder_323: 4, chilli_crushed_321: 4, cumin_seeds_329: 4, turmeric_powder_345: 5, jeera_whole_339: 3, papadam_276: 4,
    lollipop_277: 3, salted_plantain_chips_281: 15, naughty_tomato_289: 1, guinness_79: 12, black_tea_82: 9, danedar_tea_85: 4,
    premium_leaf_tea_78: 4, coconut_milk_powder_87: 3, cerelac_powder_88: 3, condensed_milk_90: 3, nido_milk_powder_92: 4, pure_red_palm_oil_111: 3,
    sesame_oil_112: 4, ghee_115: 9, palm_oil_105: 3, peanut_butter_122: 4, mixed_pickle_124: 4, jack_mackerel_125: 4,
    pineapple_158: 4, gari_white_8: 3, plantain_fufu_12: 3, black_eye_beans_5: 3, ginger_old_jamaica_2: 20, maida_flour_172: 3,
    rock_salt_177: 4, roasted_rava_176: 5, wheat_flour_76: 41, wheat_flour_77: 30, dry_fish_95: 0,
  },
}

const today = new Date()
function timeToday(hour: number, minute: number) {
  const d = new Date(today)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

// Historical requests only — REQ-1024 (Wilhelmstraße 2's live request) is
// deliberately left for the presenter to create during the demo; the store's
// nextRequestNum counter starts at 1024 so it lines up automatically.
export const INITIAL_REQUESTS: StockRequest[] = [
  {
    id: 'REQ-1012',
    branchId: 'b1',
    status: 'delivered',
    createdAt: timeToday(8, 5),
    reviewedAt: timeToday(8, 20),
    items: [
      { productId: 'basmati_rice_222', requestedQty: 10, approvedQty: 10 },
      { productId: 'ghee_115', requestedQty: 3, approvedQty: 3 },
      { productId: 'turmeric_powder_345', requestedQty: 2, approvedQty: 2 },
    ],
  },
  {
    id: 'REQ-1015',
    branchId: 'b2',
    status: 'approved',
    createdAt: timeToday(8, 40),
    reviewedAt: timeToday(8, 55),
    items: [
      { productId: 'guinness_79', requestedQty: 8, approvedQty: 8 },
      { productId: 'black_tea_82', requestedQty: 5, approvedQty: 5 },
    ],
  },
  {
    id: 'REQ-1016',
    branchId: 'b5',
    status: 'delivered',
    createdAt: timeToday(9, 0),
    reviewedAt: timeToday(9, 10),
    items: [
      { productId: 'nido_milk_powder_92', requestedQty: 4, approvedQty: 4 },
      { productId: 'cerelac_powder_88', requestedQty: 3, approvedQty: 3 },
    ],
  },
  {
    id: 'REQ-1017',
    branchId: 'b3',
    status: 'rejected',
    createdAt: timeToday(9, 15),
    reviewedAt: timeToday(9, 25),
    rejectionReason: 'Duplicate of REQ-1013, already fulfilled.',
    items: [{ productId: 'jack_mackerel_125', requestedQty: 6, approvedQty: 0 }],
  },
  {
    id: 'REQ-1018',
    branchId: 'b1',
    status: 'approved',
    createdAt: timeToday(9, 30),
    reviewedAt: timeToday(9, 45),
    items: [
      { productId: 'chana_dal_190', requestedQty: 5, approvedQty: 5 },
      { productId: 'chickpeas_192', requestedQty: 3, approvedQty: 3 },
    ],
  },
  {
    id: 'REQ-1019',
    branchId: 'b2',
    status: 'delivered',
    createdAt: timeToday(9, 50),
    reviewedAt: timeToday(10, 0),
    items: [{ productId: 'papadam_276', requestedQty: 2, approvedQty: 2 }],
  },
  {
    id: 'REQ-1021',
    branchId: 'b5',
    status: 'pending',
    createdAt: timeToday(10, 5),
    items: [
      { productId: 'salted_plantain_chips_281', requestedQty: 10 },
      { productId: 'naughty_tomato_289', requestedQty: 15 },
    ],
  },
  {
    id: 'REQ-1022',
    branchId: 'b3',
    status: 'reviewing',
    createdAt: timeToday(10, 15),
    items: [
      { productId: 'sesame_oil_112', requestedQty: 4 },
      { productId: 'condensed_milk_90', requestedQty: 3 },
      { productId: 'rock_salt_177', requestedQty: 2 },
    ],
  },
  {
    id: 'REQ-1023',
    branchId: 'b1',
    status: 'pending',
    createdAt: timeToday(10, 30),
    items: [
      { productId: 'mixed_pickle_124', requestedQty: 3 },
      { productId: 'dry_fish_95', requestedQty: 2 },
      { productId: 'maida_flour_172', requestedQty: 4 },
      { productId: 'roasted_rava_176', requestedQty: 3 },
      { productId: 'golden_sella_basmati_rice_228', requestedQty: 5 },
      { productId: 'adzuki_red_kidney_beans_218', requestedQty: 2 },
      { productId: 'peanut_butter_122', requestedQty: 4 },
    ],
  },
]

export const INITIAL_TRANSFERS: Transfer[] = [
  {
    id: 'TR-1018',
    requestId: 'REQ-1012',
    branchId: 'b1',
    status: 'delivered',
    driverId: 'd2',
    createdAt: timeToday(8, 22),
    deliveredAt: timeToday(9, 5),
    items: [
      { productId: 'basmati_rice_222', qty: 10, pickedQty: 10 },
      { productId: 'ghee_115', qty: 3, pickedQty: 3 },
      { productId: 'turmeric_powder_345', qty: 2, pickedQty: 2 },
    ],
  },
  {
    id: 'TR-1019',
    requestId: 'REQ-1019',
    branchId: 'b2',
    status: 'delivered',
    driverId: 'd2',
    createdAt: timeToday(10, 2),
    deliveredAt: timeToday(10, 40),
    items: [{ productId: 'papadam_276', qty: 2, pickedQty: 2 }],
  },
  {
    id: 'TR-1020',
    requestId: 'REQ-1015',
    branchId: 'b2',
    status: 'out_for_delivery',
    driverId: 'd1',
    createdAt: timeToday(8, 57),
    items: [
      { productId: 'guinness_79', qty: 8, pickedQty: 8 },
      { productId: 'black_tea_82', qty: 5, pickedQty: 5 },
    ],
  },
  {
    id: 'TR-1021',
    requestId: 'REQ-1016',
    branchId: 'b5',
    status: 'picking',
    driverId: 'd2',
    createdAt: timeToday(9, 12),
    items: [
      { productId: 'nido_milk_powder_92', qty: 4 },
      { productId: 'cerelac_powder_88', qty: 3 },
    ],
  },
  {
    id: 'TR-1022',
    requestId: 'REQ-1018',
    branchId: 'b1',
    status: 'ready',
    createdAt: timeToday(9, 46),
    items: [
      { productId: 'chana_dal_190', qty: 5 },
      { productId: 'chickpeas_192', qty: 3 },
    ],
  },
]

// Newest first — matches how the store prepends new events during the demo.
export const INITIAL_ACTIVITY: ActivityEvent[] = [
  { id: 'act-1', timestamp: timeToday(10, 30), kind: 'request', message: 'Kurfürstenstraße 33 submitted REQ-1023 (7 products)' },
  { id: 'act-2', timestamp: timeToday(10, 15), kind: 'request', message: 'Rudower Straße 132 submitted REQ-1022, now under review' },
  { id: 'act-3', timestamp: timeToday(10, 5), kind: 'request', message: 'Kollwitzstraße 93 submitted REQ-1021' },
  { id: 'act-4', timestamp: timeToday(9, 50), kind: 'request', message: 'Hagelberger Straße 57 submitted REQ-1019' },
  { id: 'act-5', timestamp: timeToday(10, 0), kind: 'review', message: 'Warehouse Manager approved REQ-1019 in full' },
  { id: 'act-6', timestamp: timeToday(10, 2), kind: 'transfer', message: 'Transfer TR-1019 created for Hagelberger Straße 57' },
  { id: 'act-7', timestamp: timeToday(10, 40), kind: 'delivery', message: 'TR-1019 delivered to Hagelberger Straße 57' },
  { id: 'act-8', timestamp: timeToday(9, 46), kind: 'transfer', message: 'Transfer TR-1022 created for Kurfürstenstraße 33' },
  { id: 'act-9', timestamp: timeToday(9, 45), kind: 'review', message: 'Warehouse Manager approved REQ-1018 in full' },
  { id: 'act-10', timestamp: timeToday(9, 30), kind: 'request', message: 'Kurfürstenstraße 33 submitted REQ-1018' },
  { id: 'act-11', timestamp: timeToday(9, 25), kind: 'review', message: 'Warehouse Manager rejected REQ-1017' },
  { id: 'act-12', timestamp: timeToday(9, 15), kind: 'request', message: 'Rudower Straße 132 submitted REQ-1017' },
  { id: 'act-13', timestamp: timeToday(9, 12), kind: 'transfer', message: 'Transfer TR-1021 created for Kollwitzstraße 93, driver John picking' },
  { id: 'act-14', timestamp: timeToday(9, 10), kind: 'review', message: 'Warehouse Manager approved REQ-1016 in full' },
  { id: 'act-15', timestamp: timeToday(9, 0), kind: 'request', message: 'Kollwitzstraße 93 submitted REQ-1016' },
  { id: 'act-16', timestamp: timeToday(8, 57), kind: 'transfer', message: 'Transfer TR-1020 created for Hagelberger Straße 57, driver Mike assigned' },
  { id: 'act-17', timestamp: timeToday(8, 55), kind: 'review', message: 'Warehouse Manager approved REQ-1015 in full' },
  { id: 'act-18', timestamp: timeToday(8, 40), kind: 'request', message: 'Hagelberger Straße 57 submitted REQ-1015' },
  { id: 'act-19', timestamp: timeToday(9, 5), kind: 'delivery', message: 'TR-1018 delivered to Kurfürstenstraße 33' },
  { id: 'act-20', timestamp: timeToday(9, 6), kind: 'inventory', message: 'Kurfürstenstraße 33 inventory updated from TR-1018' },
  { id: 'act-21', timestamp: timeToday(8, 22), kind: 'transfer', message: 'Transfer TR-1018 created for Kurfürstenstraße 33' },
  { id: 'act-22', timestamp: timeToday(8, 20), kind: 'review', message: 'Warehouse Manager approved REQ-1012 in full' },
  { id: 'act-23', timestamp: timeToday(8, 5), kind: 'request', message: 'Kurfürstenstraße 33 submitted REQ-1012' },
]
