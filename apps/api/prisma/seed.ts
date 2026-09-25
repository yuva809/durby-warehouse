/**
 * LOCAL DEVELOPMENT / DEMO seed — never for a real deployment.
 *
 * Seeds the Asia Might demo dataset ported from V1 (apps/web/src/data/seed.ts):
 * 1 central warehouse + 5 Berlin branches, 47 products, the same starting
 * inventory, and one demo login per role (9 users, all sharing one password).
 * IDs match V1's slugs so it's recognizable as the same dataset. Safe to
 * re-run locally — every write is an upsert — but note a re-run RESETS
 * on-hand stock for the demo products.
 *
 * Production fails closed: with NODE_ENV=production (the backend container's
 * setting) this refuses to run at all unless ALLOW_DEMO_SEED=true is set AND
 * SEED_DEMO_PASSWORD is a strong value you supplied (the public default is
 * never accepted), AND the database holds nothing but demo rows. A real
 * deployment does not seed: `prisma migrate deploy` already creates the
 * required reference data (the REQ/TR/OC/DC/INV number sequences), and the
 * first administrator comes from `npm run bootstrap:admin` (see DEPLOY.md).
 */
import { PrismaClient, LocationType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const LOCATIONS: { id: string; name: string; type: LocationType; shortName?: string; city?: string }[] = [
  { id: 'warehouse', name: 'Central Warehouse', type: LocationType.WAREHOUSE },
  { id: 'b1', name: 'Kurfürstenstraße 33', shortName: 'Kurfürsten 33', city: 'Berlin', type: LocationType.BRANCH },
  { id: 'b2', name: 'Hagelberger Straße 57', shortName: 'Hagelberger 57', city: 'Berlin', type: LocationType.BRANCH },
  { id: 'b3', name: 'Rudower Straße 132', shortName: 'Rudower 132', city: 'Berlin', type: LocationType.BRANCH },
  { id: 'b4', name: 'Wilhelmstraße 2', shortName: 'Wilhelm 2', city: 'Berlin', type: LocationType.BRANCH },
  { id: 'b5', name: 'Kollwitzstraße 93', shortName: 'Kollwitz 93', city: 'Berlin', type: LocationType.BRANCH },
];

interface SeedProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand?: string;
  pack?: string;
  unit: string;
  minStock: number;
  unitPrice: number;
  expiryDate?: string;
  sourceRef?: string;
}

const PRODUCTS: SeedProduct[] = [
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
];

// locationId -> productId -> onHand. Identical to V1's INITIAL_INVENTORY.
const INVENTORY: Record<string, Record<string, number>> = {
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
};

// Publicly known — fine for a local demo, never accepted in production.
const DEFAULT_DEMO_PASSWORD = 'ChangeMe123!';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD;
const MIN_PRODUCTION_SEED_PASSWORD_LENGTH = 12;

const USERS: { email: string; name: string; role: Role; locationId?: string }[] = [
  { email: 'admin@durby.tech', name: 'Super Admin', role: Role.SUPER_ADMIN },
  { email: 'manager@durby.tech', name: 'Warehouse Manager', role: Role.WAREHOUSE_MANAGER },
  { email: 'kurfursten@durby.tech', name: 'Kurfürstenstraße 33 Staff', role: Role.BRANCH_USER, locationId: 'b1' },
  { email: 'hagelberger@durby.tech', name: 'Hagelberger Straße 57 Staff', role: Role.BRANCH_USER, locationId: 'b2' },
  { email: 'rudower@durby.tech', name: 'Rudower Straße 132 Staff', role: Role.BRANCH_USER, locationId: 'b3' },
  { email: 'wilhelm@durby.tech', name: 'Wilhelmstraße 2 Staff', role: Role.BRANCH_USER, locationId: 'b4' },
  { email: 'kollwitz@durby.tech', name: 'Kollwitzstraße 93 Staff', role: Role.BRANCH_USER, locationId: 'b5' },
  { email: 'mike@durby.tech', name: 'Mike', role: Role.DRIVER },
  { email: 'john@durby.tech', name: 'John', role: Role.DRIVER },
];

/**
 * Throws (so the process exits non-zero before a single write) unless it is
 * safe to seed this database. Outside production nothing changes.
 */
async function assertSeedAllowed() {
  if (process.env.NODE_ENV !== 'production') return;

  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. This script creates demo users, branches and products and is for local development only. ' +
        'To create the first real administrator use `npm run bootstrap:admin` (see DEPLOY.md). ' +
        'A staging environment that genuinely wants demo data must set ALLOW_DEMO_SEED=true and a strong SEED_DEMO_PASSWORD.',
    );
  }

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password === DEFAULT_DEMO_PASSWORD || password.length < MIN_PRODUCTION_SEED_PASSWORD_LENGTH) {
    throw new Error(
      `Refusing to seed in production: SEED_DEMO_PASSWORD must be set explicitly to a strong value (at least ${MIN_PRODUCTION_SEED_PASSWORD_LENGTH} characters, not the public default).`,
    );
  }

  // The seed upserts demo rows by fixed id and resets their stock — never let it near a database holding real data.
  const [foreignUsers, foreignLocations, foreignProducts] = await Promise.all([
    prisma.user.count({ where: { email: { notIn: USERS.map((u) => u.email) } } }),
    prisma.location.count({ where: { id: { notIn: LOCATIONS.map((l) => l.id) } } }),
    prisma.product.count({ where: { id: { notIn: PRODUCTS.map((p) => p.id) } } }),
  ]);
  if (foreignUsers + foreignLocations + foreignProducts > 0) {
    throw new Error(
      `Refusing to seed in production: the database already contains non-demo data (${foreignUsers} user(s), ${foreignLocations} location(s), ${foreignProducts} product(s)).`,
    );
  }
}

async function main() {
  await assertSeedAllowed();

  for (const loc of LOCATIONS) {
    await prisma.location.upsert({ where: { id: loc.id }, update: loc, create: loc });
  }
  console.log(`Seeded ${LOCATIONS.length} locations`);

  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { ...p, expiryDate: p.expiryDate ? new Date(p.expiryDate) : null },
      create: { ...p, expiryDate: p.expiryDate ? new Date(p.expiryDate) : null },
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products`);

  let inventoryRows = 0;
  for (const [locationId, items] of Object.entries(INVENTORY)) {
    for (const [productId, onHand] of Object.entries(items)) {
      await prisma.inventoryItem.upsert({
        where: { locationId_productId: { locationId, productId } },
        update: { onHand },
        create: { locationId, productId, onHand, reserved: 0 },
      });
      inventoryRows++;
    }
  }
  console.log(`Seeded ${inventoryRows} inventory rows`);

  await prisma.codeSequence.upsert({ where: { prefix: 'REQ' }, update: {}, create: { prefix: 'REQ', value: 1023 } });
  await prisma.codeSequence.upsert({ where: { prefix: 'TR' }, update: {}, create: { prefix: 'TR', value: 1023 } });

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, locationId: u.locationId },
      create: { email: u.email, name: u.name, role: u.role, locationId: u.locationId, passwordHash },
    });
  }
  console.log(
    `Seeded ${USERS.length} demo users (${DEMO_PASSWORD === DEFAULT_DEMO_PASSWORD ? 'public default demo password' : 'password from SEED_DEMO_PASSWORD'}; local/demo use only)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
