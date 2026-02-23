import { sequelize } from "../config/database.js";
import User from "./User.js";
import Employee from "./Employee.js";
import Pass from "./Pass.js";
import File from "./File.js";
import Counterparty from "./Counterparty.js";
import ConstructionSite from "./ConstructionSite.js";
import Contract from "./Contract.js";
import Application from "./Application.js";
import ApplicationEmployeeMapping from "./ApplicationEmployee.js";
import ApplicationFileMapping from "./ApplicationFileMapping.js";
import Citizenship from "./Citizenship.js";
import CitizenshipSynonym from "./CitizenshipSynonym.js";
import Setting from "./Setting.js";
import UserEmployeeMapping from "./UserEmployeeMapping.js";
import Department from "./Department.js";
import EmployeeCounterpartyMapping from "./EmployeeCounterpartyMapping.js";
import Position from "./Position.js";
import Status from "./Status.js";
import EmployeeStatusMapping from "./EmployeeStatusMapping.js";
import CounterpartyConstructionSiteMapping from "./CounterpartyConstructionSiteMapping.js";
import ExcelColumnSet from "./ExcelColumnSet.js";
import CounterpartySubcounterpartyMapping from "./CounterpartySubcounterpartyMapping.js";
import CounterpartyTypeMapping from "./CounterpartyTypeMapping.js";
import RefreshToken from "./RefreshToken.js";
import AuditLog from "./AuditLog.js";
import UnauthorizedAccessLog from "./UnauthorizedAccessLog.js";
import DocumentType from "./DocumentType.js";
import OtCategory from "./OtCategory.js";
import OtDocument from "./OtDocument.js";
import OtTemplate from "./OtTemplate.js";
import OtInstruction from "./OtInstruction.js";
import OtContractorDocument from "./OtContractorDocument.js";
import OtContractorDocumentHistory from "./OtContractorDocumentHistory.js";
import OtContractorStatus from "./OtContractorStatus.js";
import OtContractorStatusHistory from "./OtContractorStatusHistory.js";
import OtComment from "./OtComment.js";
import TelegramAccount from "./TelegramAccount.js";
import TelegramLinkCode from "./TelegramLinkCode.js";
import TelegramCommandLog from "./TelegramCommandLog.js";
import TelegramNotificationLog from "./TelegramNotificationLog.js";

// Define associations

// User -> Employee (создатель/редактор)
User.hasMany(Employee, { foreignKey: "created_by", as: "createdEmployees" });
User.hasMany(Employee, { foreignKey: "updated_by", as: "updatedEmployees" });
Employee.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Employee.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// User -> AuditLog (пользователь -> логи действий)
User.hasMany(AuditLog, { foreignKey: "user_id", as: "auditLogs" });
AuditLog.belongsTo(User, { foreignKey: "user_id", as: "user" });

// User -> UnauthorizedAccessLog (пользователь -> несанкционированные попытки)
User.hasMany(UnauthorizedAccessLog, {
  foreignKey: "user_id",
  as: "unauthorizedAccessLogs",
});
UnauthorizedAccessLog.belongsTo(User, { foreignKey: "user_id", as: "user" });

// User -> RefreshToken (сессии)
User.hasMany(RefreshToken, { foreignKey: "user_id", as: "refreshTokens" });
RefreshToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

// Citizenship -> Employee (гражданство -> сотрудники)
Citizenship.hasMany(Employee, {
  foreignKey: "citizenship_id",
  as: "employees",
});
Employee.belongsTo(Citizenship, {
  foreignKey: "citizenship_id",
  as: "citizenship",
});

// Citizenship -> Employee (страна рождения -> сотрудники)
Citizenship.hasMany(Employee, {
  foreignKey: "birth_country_id",
  as: "employeesByBirthCountry",
});
Employee.belongsTo(Citizenship, {
  foreignKey: "birth_country_id",
  as: "birthCountry",
});

// Citizenship -> CitizenshipSynonym (гражданство -> синонимы)
Citizenship.hasMany(CitizenshipSynonym, {
  foreignKey: "citizenship_id",
  as: "synonyms",
});
CitizenshipSynonym.belongsTo(Citizenship, {
  foreignKey: "citizenship_id",
  as: "citizenship",
});

// Counterparty -> Department (контрагент -> подразделения)
Counterparty.hasMany(Department, {
  foreignKey: "counterparty_id",
  as: "departments",
});
Department.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

// ConstructionSite -> Department (объект -> подразделения, необязательная связь)
ConstructionSite.hasMany(Department, {
  foreignKey: "construction_site_id",
  as: "departments",
});
Department.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

// Employee <-> Counterparty (many-to-many через EmployeeCounterpartyMapping)
Employee.belongsToMany(Counterparty, {
  through: EmployeeCounterpartyMapping,
  foreignKey: "employee_id",
  otherKey: "counterparty_id",
  as: "counterparties",
});

Counterparty.belongsToMany(Employee, {
  through: EmployeeCounterpartyMapping,
  foreignKey: "counterparty_id",
  otherKey: "employee_id",
  as: "employees",
});

// Прямые связи для EmployeeCounterpartyMapping
Employee.hasMany(EmployeeCounterpartyMapping, {
  foreignKey: "employee_id",
  as: "employeeCounterpartyMappings",
});
EmployeeCounterpartyMapping.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

Counterparty.hasMany(EmployeeCounterpartyMapping, {
  foreignKey: "counterparty_id",
  as: "counterpartyEmployeeMappings",
});
EmployeeCounterpartyMapping.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

Department.hasMany(EmployeeCounterpartyMapping, {
  foreignKey: "department_id",
  as: "departmentEmployeeMappings",
});
EmployeeCounterpartyMapping.belongsTo(Department, {
  foreignKey: "department_id",
  as: "department",
});

ConstructionSite.hasMany(EmployeeCounterpartyMapping, {
  foreignKey: "construction_site_id",
  as: "siteEmployeeMappings",
});
EmployeeCounterpartyMapping.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

// Counterparty -> User (контрагент -> пользователи контрагента)
Counterparty.hasMany(User, { foreignKey: "counterparty_id", as: "users" });
User.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

// User -> Counterparty (создатель/редактор)
User.hasMany(Counterparty, {
  foreignKey: "created_by",
  as: "createdCounterparties",
});
User.hasMany(Counterparty, {
  foreignKey: "updated_by",
  as: "updatedCounterparties",
});
Counterparty.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Counterparty.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// Employee -> Pass (один сотрудник может иметь много пропусков)
Employee.hasMany(Pass, { foreignKey: "employee_id", as: "passes" });
Pass.belongsTo(Employee, { foreignKey: "employee_id", as: "employee" });

// Employee -> Telegram entities
Employee.hasOne(TelegramAccount, {
  foreignKey: "employee_id",
  as: "telegramAccount",
});
TelegramAccount.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

Employee.hasMany(TelegramLinkCode, {
  foreignKey: "employee_id",
  as: "telegramLinkCodes",
});
TelegramLinkCode.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

Employee.hasMany(TelegramCommandLog, {
  foreignKey: "employee_id",
  as: "telegramCommandLogs",
});
TelegramCommandLog.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

Employee.hasMany(TelegramNotificationLog, {
  foreignKey: "employee_id",
  as: "telegramNotificationLogs",
});
TelegramNotificationLog.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

// User -> Pass (выдавший/отозвавший)
User.hasMany(Pass, { foreignKey: "issued_by", as: "issuedPasses" });
User.hasMany(Pass, { foreignKey: "revoked_by", as: "revokedPasses" });
Pass.belongsTo(User, { foreignKey: "issued_by", as: "issuer" });
Pass.belongsTo(User, { foreignKey: "revoked_by", as: "revoker" });

User.hasMany(TelegramLinkCode, {
  foreignKey: "created_by",
  as: "createdTelegramLinkCodes",
});
TelegramLinkCode.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
});

// User -> File (загрузивший)
User.hasMany(File, { foreignKey: "uploaded_by", as: "uploadedFiles" });
File.belongsTo(User, { foreignKey: "uploaded_by", as: "uploader" });

// Employee -> File (файлы сотрудника)
Employee.hasMany(File, { foreignKey: "employee_id", as: "files" });
File.belongsTo(Employee, { foreignKey: "employee_id", as: "employee" });

// ConstructionSite -> Contract (объект -> договоры на объекте)
ConstructionSite.hasMany(Contract, {
  foreignKey: "construction_site_id",
  as: "contracts",
});
Contract.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

// User -> ConstructionSite (создатель/редактор)
User.hasMany(ConstructionSite, {
  foreignKey: "created_by",
  as: "createdConstructionSites",
});
User.hasMany(ConstructionSite, {
  foreignKey: "updated_by",
  as: "updatedConstructionSites",
});
ConstructionSite.belongsTo(User, { foreignKey: "created_by", as: "creator" });
ConstructionSite.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// Counterparty -> Contract (контрагент -> договоры)
Counterparty.hasMany(Contract, {
  foreignKey: "counterparty1_id",
  as: "contractsAsParty1",
});
Counterparty.hasMany(Contract, {
  foreignKey: "counterparty2_id",
  as: "contractsAsParty2",
});
Contract.belongsTo(Counterparty, {
  foreignKey: "counterparty1_id",
  as: "counterparty1",
});
Contract.belongsTo(Counterparty, {
  foreignKey: "counterparty2_id",
  as: "counterparty2",
});

// User -> Contract (создатель/редактор)
User.hasMany(Contract, { foreignKey: "created_by", as: "createdContracts" });
User.hasMany(Contract, { foreignKey: "updated_by", as: "updatedContracts" });
Contract.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Contract.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// Application -> Counterparty
Counterparty.hasMany(Application, {
  foreignKey: "counterparty_id",
  as: "applications",
});
Application.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

// Application -> ConstructionSite
ConstructionSite.hasMany(Application, {
  foreignKey: "construction_site_id",
  as: "applications",
});
Application.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

// Application -> Contract (sub)
Contract.hasMany(Application, {
  foreignKey: "subcontract_id",
  as: "subApplications",
});
Application.belongsTo(Contract, {
  foreignKey: "subcontract_id",
  as: "subcontract",
});

// User -> Application (создатель/редактор)
User.hasMany(Application, {
  foreignKey: "created_by",
  as: "createdApplications",
});
User.hasMany(Application, {
  foreignKey: "updated_by",
  as: "updatedApplications",
});
Application.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Application.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// Application -> File (полиморфная связь через entity_type и entity_id)
// Виртуальная связь для скана заявки
Application.hasOne(File, {
  foreignKey: "entity_id",
  constraints: false,
  scope: {
    entity_type: "application",
    document_type: "application_scan",
  },
  as: "scanFile",
});

// Application <-> Employee (many-to-many через ApplicationEmployeeMapping)
Application.belongsToMany(Employee, {
  through: ApplicationEmployeeMapping,
  foreignKey: "application_id",
  otherKey: "employee_id",
  as: "employees",
});

Employee.belongsToMany(Application, {
  through: ApplicationEmployeeMapping,
  foreignKey: "employee_id",
  otherKey: "application_id",
  as: "applications",
});

// Прямые связи для ApplicationEmployeeMapping (если нужно работать с таблицей напрямую)
Application.hasMany(ApplicationEmployeeMapping, {
  foreignKey: "application_id",
  as: "applicationEmployeesMapping",
});
ApplicationEmployeeMapping.belongsTo(Application, {
  foreignKey: "application_id",
  as: "application",
});

Employee.hasMany(ApplicationEmployeeMapping, {
  foreignKey: "employee_id",
  as: "employeeApplicationsMapping",
});
ApplicationEmployeeMapping.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

// Application <-> File (many-to-many через ApplicationFileMapping)
Application.belongsToMany(File, {
  through: ApplicationFileMapping,
  foreignKey: "application_id",
  otherKey: "file_id",
  as: "files",
});

File.belongsToMany(Application, {
  through: ApplicationFileMapping,
  foreignKey: "file_id",
  otherKey: "application_id",
  as: "applications",
});

// Прямые связи для ApplicationFileMapping
Application.hasMany(ApplicationFileMapping, {
  foreignKey: "application_id",
  as: "applicationFilesMapping",
});
ApplicationFileMapping.belongsTo(Application, {
  foreignKey: "application_id",
  as: "application",
});

Employee.hasMany(ApplicationFileMapping, {
  foreignKey: "employee_id",
  as: "employeeFilesMapping",
});
ApplicationFileMapping.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

File.hasMany(ApplicationFileMapping, {
  foreignKey: "file_id",
  as: "fileApplicationsMapping",
});
ApplicationFileMapping.belongsTo(File, { foreignKey: "file_id", as: "file" });

// User <-> Employee (many-to-many через UserEmployeeMapping)
User.belongsToMany(Employee, {
  through: UserEmployeeMapping,
  foreignKey: "user_id",
  otherKey: "employee_id",
  as: "employees",
});

Employee.belongsToMany(User, {
  through: UserEmployeeMapping,
  foreignKey: "employee_id",
  otherKey: "user_id",
  as: "users",
});

// Прямые связи для UserEmployeeMapping
User.hasMany(UserEmployeeMapping, {
  foreignKey: "user_id",
  as: "userEmployeesMapping",
});
UserEmployeeMapping.belongsTo(User, { foreignKey: "user_id", as: "user" });

Employee.hasMany(UserEmployeeMapping, {
  foreignKey: "employee_id",
  as: "userEmployeeMappings",
});
UserEmployeeMapping.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

Counterparty.hasMany(UserEmployeeMapping, {
  foreignKey: "counterparty_id",
  as: "userEmployeeMappings",
});
UserEmployeeMapping.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

// Position -> Employee (должность -> сотрудники)
Position.hasMany(Employee, { foreignKey: "position_id", as: "employees" });
Employee.belongsTo(Position, { foreignKey: "position_id", as: "position" });

// User -> Position (создатель/редактор)
User.hasMany(Position, { foreignKey: "created_by", as: "createdPositions" });
User.hasMany(Position, { foreignKey: "updated_by", as: "updatedPositions" });
Position.belongsTo(User, { foreignKey: "created_by", as: "creator" });
Position.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

// Status -> EmployeeStatusMapping (статус -> маппинги)
Status.hasMany(EmployeeStatusMapping, {
  foreignKey: "status_id",
  as: "employeeStatuses",
});
EmployeeStatusMapping.belongsTo(Status, {
  foreignKey: "status_id",
  as: "status",
});

// Employee -> EmployeeStatusMapping (сотрудник -> его статусы)
Employee.hasMany(EmployeeStatusMapping, {
  foreignKey: "employee_id",
  as: "statusMappings",
});
EmployeeStatusMapping.belongsTo(Employee, {
  foreignKey: "employee_id",
  as: "employee",
});

// User -> EmployeeStatusMapping (создатель/редактор)
User.hasMany(EmployeeStatusMapping, {
  foreignKey: "created_by",
  as: "createdStatusMappings",
});
User.hasMany(EmployeeStatusMapping, {
  foreignKey: "updated_by",
  as: "updatedStatusMappings",
});
EmployeeStatusMapping.belongsTo(User, {
  foreignKey: "created_by",
  as: "creator",
});
EmployeeStatusMapping.belongsTo(User, {
  foreignKey: "updated_by",
  as: "updater",
});

// Counterparty <-> ConstructionSite (many-to-many через CounterpartyConstructionSiteMapping)
Counterparty.belongsToMany(ConstructionSite, {
  through: CounterpartyConstructionSiteMapping,
  foreignKey: "counterparty_id",
  otherKey: "construction_site_id",
  as: "constructionSites",
});

ConstructionSite.belongsToMany(Counterparty, {
  through: CounterpartyConstructionSiteMapping,
  foreignKey: "construction_site_id",
  otherKey: "counterparty_id",
  as: "counterparties",
});

// Прямые связи для CounterpartyConstructionSiteMapping
Counterparty.hasMany(CounterpartyConstructionSiteMapping, {
  foreignKey: "counterparty_id",
  as: "constructionSiteMappings",
});
CounterpartyConstructionSiteMapping.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});

ConstructionSite.hasMany(CounterpartyConstructionSiteMapping, {
  foreignKey: "construction_site_id",
  as: "counterpartyMappings",
});
CounterpartyConstructionSiteMapping.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

// ExcelColumnSet -> Counterparty (набор столбцов -> контрагент)
Counterparty.hasMany(ExcelColumnSet, {
  foreignKey: "counterpartyId",
  as: "excelColumnSets",
});
ExcelColumnSet.belongsTo(Counterparty, {
  foreignKey: "counterpartyId",
  as: "counterparty",
});

// User -> ExcelColumnSet (создатель/редактор набора столбцов)
User.hasMany(ExcelColumnSet, {
  foreignKey: "createdBy",
  as: "createdExcelColumnSets",
});
User.hasMany(ExcelColumnSet, {
  foreignKey: "updatedBy",
  as: "updatedExcelColumnSets",
});
ExcelColumnSet.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
ExcelColumnSet.belongsTo(User, { foreignKey: "updatedBy", as: "updater" });

// Counterparty -> CounterpartyTypeMapping (контрагент -> типы)
Counterparty.hasOne(CounterpartyTypeMapping, {
  foreignKey: "counterpartyId",
  as: "typeMapping",
});
CounterpartyTypeMapping.belongsTo(Counterparty, {
  foreignKey: "counterpartyId",
  as: "counterparty",
});

// CounterpartySubcounterpartyMapping ассоциации
CounterpartySubcounterpartyMapping.belongsTo(Counterparty, {
  foreignKey: "parentCounterpartyId",
  as: "parentCounterparty",
});
CounterpartySubcounterpartyMapping.belongsTo(Counterparty, {
  foreignKey: "childCounterpartyId",
  as: "childCounterparty",
});
CounterpartySubcounterpartyMapping.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

// Counterparty -> CounterpartySubcounterpartyMapping (родитель -> дети)
Counterparty.hasMany(CounterpartySubcounterpartyMapping, {
  foreignKey: "parentCounterpartyId",
  as: "childMappings",
});
Counterparty.hasMany(CounterpartySubcounterpartyMapping, {
  foreignKey: "childCounterpartyId",
  as: "parentMappings",
});

// ===== OT Module Associations =====

// Categories (self hierarchy)
OtCategory.hasMany(OtCategory, {
  foreignKey: "parent_id",
  as: "children",
});
OtCategory.belongsTo(OtCategory, {
  foreignKey: "parent_id",
  as: "parent",
});

// Categories -> Documents
OtCategory.hasMany(OtDocument, {
  foreignKey: "category_id",
  as: "documents",
});
OtDocument.belongsTo(OtCategory, {
  foreignKey: "category_id",
  as: "category",
});

// Documents -> Template file
OtDocument.belongsTo(File, {
  foreignKey: "template_file_id",
  as: "templateFile",
});
File.hasMany(OtDocument, {
  foreignKey: "template_file_id",
  as: "otDocuments",
});

// Templates -> File
OtTemplate.belongsTo(File, { foreignKey: "file_id", as: "file" });
File.hasMany(OtTemplate, { foreignKey: "file_id", as: "otTemplates" });

// Instructions -> File
OtInstruction.belongsTo(File, { foreignKey: "file_id", as: "file" });
File.hasMany(OtInstruction, { foreignKey: "file_id", as: "otInstructions" });

// Contractor documents
OtContractorDocument.belongsTo(OtDocument, {
  foreignKey: "document_id",
  as: "document",
});
OtContractorDocument.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});
OtContractorDocument.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});
OtContractorDocument.belongsTo(File, {
  foreignKey: "file_id",
  as: "file",
});
OtContractorDocument.belongsTo(User, {
  foreignKey: "uploaded_by",
  as: "uploader",
});
OtContractorDocument.belongsTo(User, {
  foreignKey: "checked_by",
  as: "checker",
});

OtContractorDocument.hasMany(OtContractorDocumentHistory, {
  foreignKey: "contractor_document_id",
  as: "history",
});
OtContractorDocumentHistory.belongsTo(OtContractorDocument, {
  foreignKey: "contractor_document_id",
  as: "contractorDocument",
});
OtContractorDocumentHistory.belongsTo(User, {
  foreignKey: "changed_by",
  as: "changedByUser",
});

// Contractor status
OtContractorStatus.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});
OtContractorStatus.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});

OtContractorStatusHistory.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});
OtContractorStatusHistory.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});
OtContractorStatusHistory.belongsTo(User, {
  foreignKey: "changed_by",
  as: "changedByUser",
});

// Comments
OtComment.belongsTo(User, { foreignKey: "created_by", as: "creator" });
OtComment.belongsTo(Counterparty, {
  foreignKey: "counterparty_id",
  as: "counterparty",
});
OtComment.belongsTo(ConstructionSite, {
  foreignKey: "construction_site_id",
  as: "constructionSite",
});
OtComment.belongsTo(OtContractorDocument, {
  foreignKey: "contractor_document_id",
  as: "contractorDocument",
});

export {
  sequelize,
  User,
  Employee,
  Pass,
  File,
  Counterparty,
  ConstructionSite,
  Contract,
  Application,
  ApplicationEmployeeMapping,
  ApplicationFileMapping,
  Citizenship,
  CitizenshipSynonym,
  Setting,
  UserEmployeeMapping,
  Department,
  EmployeeCounterpartyMapping,
  Position,
  Status,
  EmployeeStatusMapping,
  CounterpartyConstructionSiteMapping,
  ExcelColumnSet,
  CounterpartySubcounterpartyMapping,
  CounterpartyTypeMapping,
  AuditLog,
  UnauthorizedAccessLog,
  DocumentType,
  RefreshToken,
  OtCategory,
  OtDocument,
  OtTemplate,
  OtInstruction,
  OtContractorDocument,
  OtContractorDocumentHistory,
  OtContractorStatus,
  OtContractorStatusHistory,
  OtComment,
  TelegramAccount,
  TelegramLinkCode,
  TelegramCommandLog,
  TelegramNotificationLog,
};
