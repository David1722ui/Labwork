num = int (input("Введите трехзначное число"))
d1= num // 100
d2 = (num// 10) % 10
d3 = num % 10

digit_sum= d1+d2+d3
digit_mult= d1*d2*d3

print(f"Сумма цифр: {digit_sum}")
print(f"Произведение цифр: {digit_mult}")