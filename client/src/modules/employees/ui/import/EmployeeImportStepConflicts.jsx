import { memo } from "react";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Empty, Radio, Space, Table, Tooltip } from "antd";
import dayjs from "dayjs";

const validationColumns = [
  {
    title: "№",
    dataIndex: "rowIndex",
    width: 50,
    align: "center",
  },
  {
    title: "Фамилия",
    dataIndex: "lastName",
    key: "lastName",
    width: 100,
  },
  {
    title: "Имя",
    dataIndex: "firstName",
    key: "firstName",
    width: 100,
  },
  {
    title: "ИНН",
    dataIndex: "inn",
    key: "inn",
    width: 110,
  },
  {
    title: "Ошибка",
    dataIndex: "errors",
    key: "errors",
    render: (errors) => {
      const duplicatesMap = new Map();

      return (
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          {errors.map((error) => {
            const count = (duplicatesMap.get(error) || 0) + 1;
            duplicatesMap.set(error, count);
            return (
              <li key={`${error}-${count}`} style={{ color: "#d9534f" }}>
                {error}
              </li>
            );
          })}
        </ul>
      );
    },
  },
];

const EmployeeImportStepConflicts = memo(
  ({
    validationResult,
    conflictResolutions,
    onConflictResolutionChange,
    onResolveAll,
  }) => {
    const hasValidationErrors =
      (validationResult?.validationErrors?.length || 0) > 0;
    const hasConflicts = (validationResult?.conflictingInns?.length || 0) > 0;

    return (
      <div>
        {hasValidationErrors ? (
          <div style={{ marginBottom: "24px" }}>
            <h4 style={{ color: "#d9534f" }}>
              <ExclamationCircleOutlined /> Ошибки валидации (
              {validationResult.validationErrors.length})
            </h4>
            <Table
              dataSource={validationResult.validationErrors}
              columns={validationColumns}
              pagination={{
                pageSize: 100,
                showSizeChanger: true,
                pageSizeOptions: ["50", "100", "200"],
              }}
              size="small"
              rowKey="rowIndex"
            />
            <p style={{ marginTop: "12px", color: "#999" }}>
              ⓘ Эти записи будут пропущены при импорте
            </p>
          </div>
        ) : null}

        {hasConflicts ? (
          <div>
            <h4 style={{ color: "#faad14" }}>
              ⚠️ Конфликты ИНН сотрудников (
              {validationResult.conflictingInns.length})
            </h4>
            <Space
              style={{ marginBottom: "16px", width: "100%" }}
              direction="vertical"
            >
              <p>
                Эти ИНН уже существуют в системе. Выберите действие для каждого
                или для всех сразу:
              </p>
              <Space wrap>
                <Tooltip title="Заменить все существующие сотрудники новыми данными из файла">
                  <Button
                    type="primary"
                    onClick={() => onResolveAll("update")}
                    size="small"
                  >
                    Заменить всех
                  </Button>
                </Tooltip>
                <Tooltip title="Пропустить все конфликтующие записи из файла">
                  <Button onClick={() => onResolveAll("skip")} size="small">
                    Пропустить всех
                  </Button>
                </Tooltip>
              </Space>
            </Space>

            <Table
              dataSource={validationResult.conflictingInns}
              columns={[
                {
                  title: "Имя",
                  render: (_, record) => (
                    <div>
                      {record.newEmployee.lastName}{" "}
                      {record.newEmployee.firstName}
                    </div>
                  ),
                  width: 120,
                },
                {
                  title: "ИНН",
                  dataIndex: "inn",
                  key: "inn",
                  width: 100,
                },
                {
                  title: "На портале",
                  render: (_, record) => (
                    <div style={{ fontSize: "12px" }}>
                      <div>
                        <strong>
                          {record.existingEmployee.lastName}{" "}
                          {record.existingEmployee.firstName}{" "}
                          {record.existingEmployee.middleName || ""}
                        </strong>
                      </div>
                      <div style={{ color: "#999" }}>
                        ИНН: {record.existingEmployee.inn}
                      </div>
                      {record.existingEmployee.snils ? (
                        <div style={{ color: "#999" }}>
                          СНИЛС: {record.existingEmployee.snils}
                        </div>
                      ) : null}
                      {record.existingEmployee.birthDate ? (
                        <div style={{ color: "#999" }}>
                          Дата рожд.:{" "}
                          {dayjs(record.existingEmployee.birthDate).format(
                            "DD.MM.YYYY",
                          )}
                        </div>
                      ) : null}
                    </div>
                  ),
                  width: 220,
                },
                {
                  title: "В файле",
                  render: (_, record) => (
                    <div style={{ fontSize: "12px" }}>
                      <div>
                        <strong>
                          {record.newEmployee.lastName}{" "}
                          {record.newEmployee.firstName}{" "}
                          {record.newEmployee.middleName || ""}
                        </strong>
                      </div>
                      <div style={{ color: "#999" }}>
                        ИНН: {record.newEmployee.inn}
                      </div>
                      {record.newEmployee.snils ? (
                        <div style={{ color: "#999" }}>
                          СНИЛС: {record.newEmployee.snils}
                        </div>
                      ) : null}
                      {record.newEmployee.birthDate ? (
                        <div style={{ color: "#999" }}>
                          Дата рожд.:{" "}
                          {dayjs(record.newEmployee.birthDate).format(
                            "DD.MM.YYYY",
                          )}
                        </div>
                      ) : null}
                    </div>
                  ),
                  width: 220,
                },
                {
                  title: "Действие",
                  render: (_, record) => (
                    <Radio.Group
                      value={conflictResolutions[record.inn] || "skip"}
                      onChange={(event) =>
                        onConflictResolutionChange(
                          record.inn,
                          event.target.value,
                        )
                      }
                    >
                      <Radio value="update">Заменить</Radio>
                      <Radio value="skip">Пропустить</Radio>
                    </Radio.Group>
                  ),
                  width: 150,
                },
              ]}
              pagination={{
                pageSize: 100,
                showSizeChanger: true,
                pageSizeOptions: ["50", "100", "200"],
              }}
              size="small"
              rowKey="inn"
              scroll={{ x: 700 }}
            />
          </div>
        ) : null}

        {!hasValidationErrors && !hasConflicts ? (
          <Empty description="Все данные валидны, конфликтов не найдено" />
        ) : null}
      </div>
    );
  },
);

EmployeeImportStepConflicts.displayName = "EmployeeImportStepConflicts";

export default EmployeeImportStepConflicts;
