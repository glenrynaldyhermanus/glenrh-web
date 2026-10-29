FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/notes-api . \
 && mkdir -p /out/data/notes

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/notes-api /notes-api
# A fresh named volume copies this directory, ownership included, so the
# nonroot user can write to it.
COPY --from=build --chown=65532:65532 /out/data /data
ENV NOTES_DIR=/data/notes PORT=8080
EXPOSE 8080
VOLUME /data/notes
ENTRYPOINT ["/notes-api"]
