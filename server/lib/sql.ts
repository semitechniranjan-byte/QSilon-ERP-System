/** Attendance % = (present + late + ½·half-day) ÷ (marked days − approved leave). Expects alias `a` for attendance_records. */
export const PCT_SQL = `round(100.0 * (count(*) FILTER (WHERE a.status IN ('present','late')) + 0.5 * count(*) FILTER (WHERE a.status = 'half_day'))
  / nullif(count(*) FILTER (WHERE a.status <> 'leave'), 0), 1)`;
