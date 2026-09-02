type ShiftTimes = { startTime: string; endTime: string; gracePeriodMinutes: number };

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function calculateAttendanceDurations(checkIn: string | null, checkOut: string | null, shift: ShiftTimes) {
  const shiftStart = timeToMinutes(shift.startTime);
  let shiftEnd = timeToMinutes(shift.endTime);
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;

  const checkInMinutes = checkIn ? timeToMinutes(checkIn) : null;
  let checkOutMinutes = checkOut ? timeToMinutes(checkOut) : null;
  if (checkOutMinutes !== null && checkOutMinutes < shiftStart) checkOutMinutes += 24 * 60;

  return {
    lateMinutes: checkInMinutes === null ? 0 : Math.max(0, checkInMinutes - shiftStart - shift.gracePeriodMinutes),
    overtimeMinutes: checkOutMinutes === null ? 0 : Math.max(0, checkOutMinutes - shiftEnd),
  };
}
