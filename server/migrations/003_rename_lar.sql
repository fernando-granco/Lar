-- The app was renamed from Homebase to Lar. Households that kept the default name follow along.
UPDATE settings SET value = 'Lar' WHERE key = 'household_name' AND value = 'Homebase';
