deposit = float(input("Введите сумму вклада: "))
rate = float(input("Введите годовую процентную ставку: "))
years = float(input("Введите срок вклада в годах: "))


final_amount = deposit * (1 + rate / 100) ** years

print(f"Итоговая сумма: {final_amount:.2f}")
