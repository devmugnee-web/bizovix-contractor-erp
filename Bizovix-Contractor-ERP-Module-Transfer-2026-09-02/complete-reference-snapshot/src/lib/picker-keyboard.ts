export type PickerNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function isPickerNavigationKey(key: string): key is PickerNavigationKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

export function getNextPickerIndex(currentIndex: number, optionCount: number, key: PickerNavigationKey) {
  if (optionCount <= 0) {
    return -1;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return optionCount - 1;
  }

  if (key === "ArrowDown") {
    return currentIndex < 0 || currentIndex >= optionCount - 1 ? 0 : currentIndex + 1;
  }

  return currentIndex <= 0 ? optionCount - 1 : currentIndex - 1;
}
