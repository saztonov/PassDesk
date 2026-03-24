BEGIN;

UPDATE public.citizenships SET code = 'AZE' WHERE name = 'Азербайджан'        AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'ARM' WHERE name = 'Армения'             AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'BLR' WHERE name = 'Беларусь'            AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'GNB' WHERE name = 'Гвинея-Бисау'        AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'IRN' WHERE name ILIKE 'Иран%'           AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'KAZ' WHERE name = 'Казахстан';
UPDATE public.citizenships SET code = 'KGZ' WHERE name = 'Киргизия'            AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'MDA' WHERE name ILIKE 'Молдов%'         AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'NAM' WHERE name = 'Намибия'             AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'SRB' WHERE name = 'Сербия'              AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'TJK' WHERE name = 'Таджикистан'         AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'TUR' WHERE name = 'Турция'              AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'UZB' WHERE name = 'Узбекистан'          AND (code IS NULL OR code = '');
UPDATE public.citizenships SET code = 'UKR' WHERE name = 'Украина'             AND (code IS NULL OR code = '');

COMMIT;
