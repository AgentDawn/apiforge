FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o apiforge-server ./cmd/apiforge-server/

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/apiforge-server /usr/local/bin/
EXPOSE 8090
CMD ["apiforge-server"]
