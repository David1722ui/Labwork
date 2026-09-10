import math

a = float(input("Введите длину: "))
b = float(input("Введите ширину: "))

S = a * b
P = 2 * (a + b)
d = math.sqrt(a ** 2 + b ** 2)

print("Площадь:", S)
print("Периметр:", P)
print("Диагональ:", d)
