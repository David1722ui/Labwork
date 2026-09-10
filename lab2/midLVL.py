price = float(input("Введите стоимость одной единицы товара: "))
quantity = int(input("Введите количество единиц: "))
discount_percent = float(input("Введите процент скидки: "))


initial_cost = price * quantity


discount = initial_cost * discount_percent / 100


final_cost = initial_cost - discount

print("\nРезультаты:")
print(f"Первоначальная стоимость: {initial_cost:.2f}")
print(f"Сумма скидки: {discount:.2f}")
print(f"Итоговая стоимость: {final_cost:.2f}")
