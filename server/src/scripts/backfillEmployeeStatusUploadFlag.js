/**
 * Backfill флага is_upload для всех активных статусов сотрудников.
 *
 * Использование:
 * node src/scripts/backfillEmployeeStatusUploadFlag.js
 * node src/scripts/backfillEmployeeStatusUploadFlag.js --write
 */

import { EmployeeStatusMapping } from "../models/index.js";

const shouldWrite = process.argv.includes("--write");

const run = async () => {
  console.log("🔄 Проверяем активные статусы сотрудников...");

  const totalActiveMappings = await EmployeeStatusMapping.count({
    where: { isActive: true },
  });
  const notUploadedMappings = await EmployeeStatusMapping.count({
    where: {
      isActive: true,
      isUpload: false,
    },
  });

  console.log(`📊 Активных статусов: ${totalActiveMappings}`);
  console.log(`📊 Активных статусов с is_upload=false: ${notUploadedMappings}`);

  if (!shouldWrite) {
    console.log("ℹ️ Dry-run режим. Для записи запустите с флагом --write");
    return;
  }

  const [updatedCount] = await EmployeeStatusMapping.update(
    {
      isUpload: true,
      updatedAt: new Date(),
    },
    {
      where: {
        isActive: true,
        isUpload: false,
      },
    },
  );

  console.log(`✅ Обновлено записей: ${updatedCount}`);
};

run()
  .then(() => {
    console.log("✅ Скрипт завершен");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка backfill is_upload:", error);
    process.exit(1);
  });
