import { memo } from "react";
import { EmployeeTable, MobileEmployeeList } from "@/widgets/employee-table";

const EmployeesListSection = memo(({ isMobile, model, actions }) => {
  if (isMobile) {
    return (
      <MobileEmployeeList
        employees={model.filteredEmployees}
        total={model.totalCount}
        loading={model.loading}
        currentPage={model.currentPage}
        pageSize={model.pageSize}
        onPageChange={actions.onPaginationChange}
        onView={actions.onView}
        onEdit={actions.onEdit}
        onDelete={actions.onDelete}
        onViewFiles={actions.onViewFiles}
        canDeleteEmployee={model.canDeleteEmployee}
        canMarkForDeletion={model.canMarkForDeletion}
        onMarkForDeletion={actions.onMarkForDeletion}
      />
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        paddingRight: 15,
      }}
    >
      <EmployeeTable
        employees={model.filteredEmployees}
        total={model.totalCount}
        departments={model.departments}
        loading={model.loading}
        currentPage={model.currentPage}
        pageSize={model.pageSize}
        onPaginationChange={actions.onPaginationChange}
        onEdit={actions.onEdit}
        onView={actions.onView}
        onDelete={actions.onDelete}
        onViewFiles={actions.onViewFiles}
        onDepartmentChange={actions.onDepartmentChange}
        canExport={model.canExport}
        showDepartmentColumn={model.showDepartmentColumn}
        showCounterpartyColumn={model.showCounterpartyColumn}
        canDeleteEmployee={model.canDeleteEmployee}
        canMarkForDeletion={model.canMarkForDeletion}
        onMarkForDeletion={actions.onMarkForDeletion}
        uniqueFilters={model.uniqueFilters}
        filterOptions={model.filterOptions}
        onFiltersChange={actions.onFiltersChange}
        defaultCounterpartyId={model.defaultCounterpartyId}
        userCounterpartyId={model.userCounterpartyId}
        onConstructionSitesEdit={actions.onConstructionSitesEdit}
        resetTrigger={model.resetTrigger}
        hiddenColumnKeys={model.hiddenColumns}
        currentSortBy={model.sortBy}
        currentSortOrder={model.sortOrder}
        onSortChange={actions.onSortChange}
        statsPeriod={model.statsPeriod}
        portalStats={model.portalStats}
        portalStatsLoading={model.portalStatsLoading}
        onStatsPeriodChange={actions.onStatsPeriodChange}
      />
    </div>
  );
});

EmployeesListSection.displayName = "EmployeesListSection";

export default EmployeesListSection;
