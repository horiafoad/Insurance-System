import FacultySalaryArchivePage from "./FacultySalaryArchivePage";
import { EMPLOYEE_SALARY_CONFIG } from "./salaryArchiveConfig";

export default function EmployeeSalaryArchivePage({ currentUser }) {
  return <FacultySalaryArchivePage currentUser={currentUser} config={EMPLOYEE_SALARY_CONFIG} />;
}