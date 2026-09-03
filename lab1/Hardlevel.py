start_hours = int(input("Введите часы начала (0-23): "))
start_minutes = int(input("Введите минуты начала (0-59): "))
duration = int(input("Введите длительность в минутах: "))


total_start_mins = start_hours * 60 + start_minutes
total_end_mins = total_start_mins + duration


end_hours = (total_end_mins // 60) % 24
end_minutes = total_end_mins % 60

print(f"Время окончания: {end_hours:02d}:{end_minutes:02d}")