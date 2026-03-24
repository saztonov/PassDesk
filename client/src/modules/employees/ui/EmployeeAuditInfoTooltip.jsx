import dayjs from "dayjs";
import { Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD.MM.YYYY HH:mm") : "—";
};

const formatUserName = (user) => {
  if (!user) return "—";

  const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  return user.email || "—";
};

const EmployeeAuditInfoTooltip = ({ employee }) => {
  if (!employee) {
    return null;
  }

  const creatorName = formatUserName(employee.creator);
  const createdAt = formatDateTime(employee.createdAt);
  const hasEditor = Boolean(employee.updater);
  const updaterName = hasEditor ? formatUserName(employee.updater) : "Не редактировался";
  const updatedAt = hasEditor ? formatDateTime(employee.updatedAt) : "—";

  const tooltipContent = (
    <div>
      <div>
        <strong>Создал:</strong> {creatorName}
      </div>
      <div>{createdAt}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Последнее изменение:</strong> {updaterName}
      </div>
      <div>{updatedAt}</div>
    </div>
  );

  return (
    <Tooltip placement="left" title={tooltipContent}>
      <InfoCircleOutlined
        style={{ color: "#8c8c8c", fontSize: 16, cursor: "pointer" }}
      />
    </Tooltip>
  );
};

export default EmployeeAuditInfoTooltip;
